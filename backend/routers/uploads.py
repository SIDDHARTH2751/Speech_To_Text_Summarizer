"""
routers/uploads.py — Upload endpoints.

POST /api/uploads                    — upload a file, kick off background processing
GET  /api/uploads                    — list all uploads
GET  /api/uploads/{id}               — single upload with full transcript + summary
GET  /api/uploads/{id}/chunks?after=N — lightweight polling for new chunks (frontend polls every 2s)
POST /api/uploads/{id}/summarize     — retry summary generation if it failed
"""

import asyncio
import uuid
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import get_db
from models import Upload, TranscriptChunk, Summary
from schemas import (
    UploadResponse, UploadDetail, UploadListItem,
    TranscriptChunkResponse, SummaryResponse, ChunksPollingResponse,
)
from storage import save_file
from services.worker import process_upload, run_summarize

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# Allowed audio MIME types (loose check — ffprobe does the real validation)
ALLOWED_TYPES = {
    "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a",
    "audio/ogg", "audio/webm", "audio/flac", "audio/aac",
    "video/webm",  # some browsers report webm audio as video/webm
}


@router.post("", response_model=UploadResponse)
async def upload_audio(
    file: UploadFile = File(...),
    language_code: str = Form("en-IN"),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept an audio file upload.
    Saves to storage, creates a DB record, and kicks off background processing.
    Returns immediately with the upload ID — never transcribes inside the request.
    """
    content_type = file.content_type or ""
    if content_type and content_type not in ALLOWED_TYPES and not content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type}")

    upload_id = str(uuid.uuid4())
    ext = file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin"
    storage_key = f"{upload_id}/original.{ext}"

    await save_file(storage_key, file)

    upload = Upload(
        id=upload_id,
        filename=file.filename or "untitled",
        storage_key=storage_key,
        status="queued",
        language_code=language_code,
    )
    db.add(upload)
    await db.commit()

    # Fire and forget — the worker updates the DB as it progresses
    asyncio.create_task(process_upload(upload_id))

    return UploadResponse(id=upload_id, status="queued")


@router.get("", response_model=list[UploadListItem])
async def list_uploads(db: AsyncSession = Depends(get_db)):
    """List all uploads, newest first."""
    result = await db.execute(select(Upload).order_by(Upload.created_at.desc()))
    uploads = result.scalars().all()
    return [
        UploadListItem(
            id=u.id, filename=u.filename, status=u.status,
            error_message=u.error_message, summary_error=u.summary_error,
            duration_sec=u.duration_sec,
            chunks_total=u.chunks_total, chunks_done=u.chunks_done,
            language_code=u.language_code, created_at=u.created_at,
        )
        for u in uploads
    ]


@router.get("/{upload_id}", response_model=UploadDetail)
async def get_upload(upload_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single upload with its transcript chunks and summary."""
    result = await db.execute(
        select(Upload)
        .options(selectinload(Upload.chunks), selectinload(Upload.summary))
        .where(Upload.id == upload_id)
    )
    upload = result.scalar_one_or_none()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    return UploadDetail(
        id=upload.id, filename=upload.filename, status=upload.status,
        error_message=upload.error_message, summary_error=upload.summary_error,
        duration_sec=upload.duration_sec,
        chunks_total=upload.chunks_total, chunks_done=upload.chunks_done,
        language_code=upload.language_code, created_at=upload.created_at,
        transcript_chunks=[
            TranscriptChunkResponse(
                idx=c.idx, start_sec=c.start_sec, end_sec=c.end_sec,
                text=c.text, status=c.status, error=c.error,
            )
            for c in upload.chunks
        ],
        summary=SummaryResponse(
            rolling_summary=upload.summary.rolling_summary,
            final_summary=upload.summary.final_summary,
        ) if upload.summary else None,
    )


@router.get("/{upload_id}/chunks", response_model=ChunksPollingResponse)
async def poll_chunks(
    upload_id: str,
    after: int = Query(-1, description="Return chunks with idx > this value. Use -1 for all."),
    db: AsyncSession = Depends(get_db),
):
    """
    Lightweight polling endpoint — frontend calls this every 2 seconds.
    Returns only new chunks (idx > after) plus current status and summary.
    """
    upload = await db.get(Upload, upload_id)
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    # Fetch only chunks newer than `after`, in order
    result = await db.execute(
        select(TranscriptChunk)
        .where(TranscriptChunk.upload_id == upload_id)
        .where(TranscriptChunk.idx > after)
        .where(TranscriptChunk.status != "pending")  # only return completed/failed chunks
        .order_by(TranscriptChunk.idx)
    )
    chunks = result.scalars().all()

    # Fetch summary if it exists
    summary_result = await db.execute(
        select(Summary).where(Summary.upload_id == upload_id)
    )
    summary = summary_result.scalar_one_or_none()

    return ChunksPollingResponse(
        status=upload.status,
        chunks_done=upload.chunks_done,
        chunks_total=upload.chunks_total,
        chunks=[
            TranscriptChunkResponse(
                idx=c.idx, start_sec=c.start_sec, end_sec=c.end_sec,
                text=c.text, status=c.status, error=c.error,
            )
            for c in chunks
        ],
        rolling_summary=summary.rolling_summary if summary else None,
        final_summary=summary.final_summary if summary else None,
        error_message=upload.error_message,
        summary_error=upload.summary_error,
    )


@router.post("/{upload_id}/summarize")
async def retry_summarize(upload_id: str, db: AsyncSession = Depends(get_db)):
    """
    Retry summary generation for an upload whose summary failed.
    Re-reads all successful transcript chunks and runs the Groq pipeline again.
    """
    upload = await db.get(Upload, upload_id)
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    try:
        await run_summarize(upload_id)
        return {"status": "ok", "message": "Summary regenerated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)[:200]}")
