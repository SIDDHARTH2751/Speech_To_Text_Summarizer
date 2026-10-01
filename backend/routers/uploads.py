"""
routers/uploads.py — Upload endpoints.
POST /api/uploads   — upload a file, kick off background processing
GET  /api/uploads    — list all uploads
GET  /api/uploads/{id} — single upload with transcript + summary
"""

import asyncio
import uuid
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import get_db
from models import Upload, TranscriptChunk, Summary
from schemas import UploadResponse, UploadDetail, UploadListItem, TranscriptChunkResponse, SummaryResponse
from storage import save_file
from services.worker import process_upload

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
    Returns immediately with the upload ID.
    """
    # Basic MIME check (ffprobe will do thorough validation in the worker)
    content_type = file.content_type or ""
    if content_type and content_type not in ALLOWED_TYPES and not content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type}")

    # Generate a unique storage key
    upload_id = str(uuid.uuid4())
    ext = file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin"
    storage_key = f"{upload_id}/original.{ext}"

    # Save file to storage
    await save_file(storage_key, file)

    # Create DB record
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
    result = await db.execute(
        select(Upload).order_by(Upload.created_at.desc())
    )
    uploads = result.scalars().all()

    return [
        UploadListItem(
            id=u.id,
            filename=u.filename,
            status=u.status,
            error_message=u.error_message,
            duration_sec=u.duration_sec,
            chunks_total=u.chunks_total,
            chunks_done=u.chunks_done,
            language_code=u.language_code,
            created_at=u.created_at,
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
        id=upload.id,
        filename=upload.filename,
        status=upload.status,
        error_message=upload.error_message,
        duration_sec=upload.duration_sec,
        chunks_total=upload.chunks_total,
        chunks_done=upload.chunks_done,
        language_code=upload.language_code,
        created_at=upload.created_at,
        transcript_chunks=[
            TranscriptChunkResponse(
                idx=c.idx, start_sec=c.start_sec, end_sec=c.end_sec, text=c.text
            )
            for c in upload.chunks
        ],
        summary=SummaryResponse(
            rolling_summary=upload.summary.rolling_summary,
            final_summary=upload.summary.final_summary,
        ) if upload.summary else None,
    )
