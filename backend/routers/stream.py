"""
routers/stream.py — Server-Sent Events endpoint for live progress.

GET /api/uploads/{id}/stream

Events sent:
  - status       {status: "transcribing"}
  - progress     {chunks_done: 2, chunks_total: 5}
  - transcript_chunk  {idx: 0, start_sec: 0, end_sec: 30, text: "..."}
  - summary_update    {rolling_summary: "...", final_summary: "..."}
  - error        {message: "..."}
  - done         {}

On connect, replays all already-saved chunks so the client
can reconnect without missing anything.
"""

import asyncio
import json
import logging
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db import async_session
from models import Upload, TranscriptChunk, Summary

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uploads", tags=["stream"])


@router.get("/{upload_id}/stream")
async def stream_upload(upload_id: str):
    """SSE endpoint that streams transcription progress in real time."""
    return EventSourceResponse(event_generator(upload_id))


async def event_generator(upload_id: str):
    """
    Async generator that yields SSE events.
    Polls the DB every second for new chunks, summary changes, and status updates.
    """
    last_chunks_sent = 0
    last_status = None
    last_rolling_summary = None
    last_final_summary = None

    while True:
        async with async_session() as session:
            # Fetch current upload state
            upload = await session.get(Upload, upload_id)

            if not upload:
                yield {
                    "event": "error",
                    "data": json.dumps({"message": "Upload not found"}),
                }
                return

            # Send status update if changed
            if upload.status != last_status:
                last_status = upload.status
                yield {
                    "event": "status",
                    "data": json.dumps({"status": upload.status}),
                }

            # Send progress update
            if upload.chunks_total > 0:
                yield {
                    "event": "progress",
                    "data": json.dumps({
                        "chunks_done": upload.chunks_done,
                        "chunks_total": upload.chunks_total,
                    }),
                }

            # Send any new transcript chunks
            if upload.chunks_done > last_chunks_sent:
                result = await session.execute(
                    select(TranscriptChunk)
                    .where(TranscriptChunk.upload_id == upload_id)
                    .where(TranscriptChunk.idx >= last_chunks_sent)
                    .order_by(TranscriptChunk.idx)
                )
                new_chunks = result.scalars().all()

                for chunk in new_chunks:
                    yield {
                        "event": "transcript_chunk",
                        "data": json.dumps({
                            "idx": chunk.idx,
                            "start_sec": chunk.start_sec,
                            "end_sec": chunk.end_sec,
                            "text": chunk.text,
                        }),
                    }

                last_chunks_sent = upload.chunks_done

            # Send summary updates if changed
            summary_result = await session.execute(
                select(Summary).where(Summary.upload_id == upload_id)
            )
            summary = summary_result.scalar_one_or_none()

            if summary:
                rolling = summary.rolling_summary
                final = summary.final_summary

                if rolling != last_rolling_summary or final != last_final_summary:
                    last_rolling_summary = rolling
                    last_final_summary = final
                    yield {
                        "event": "summary_update",
                        "data": json.dumps({
                            "rolling_summary": rolling,
                            "final_summary": final,
                        }),
                    }

            # Terminal states — send final event and stop
            if upload.status == "done":
                yield {
                    "event": "done",
                    "data": json.dumps({}),
                }
                return

            if upload.status == "failed":
                yield {
                    "event": "error",
                    "data": json.dumps({"message": upload.error_message or "Unknown error"}),
                }
                return

        # Poll interval
        await asyncio.sleep(1)
