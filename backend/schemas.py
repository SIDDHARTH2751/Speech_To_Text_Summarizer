"""
schemas.py — Pydantic models for API request/response shapes.
"""

from pydantic import BaseModel
from datetime import datetime


# ── Response ─────────────────────────────────────────────

class UploadResponse(BaseModel):
    id: str
    status: str


class TranscriptChunkResponse(BaseModel):
    idx: int
    start_sec: float
    end_sec: float
    text: str
    status: str       # pending | done | failed
    error: str | None = None


class SummaryResponse(BaseModel):
    rolling_summary: str | None
    final_summary: str | None


class UploadDetail(BaseModel):
    id: str
    filename: str
    status: str
    error_message: str | None
    summary_error: str | None = None
    duration_sec: float | None
    chunks_total: int
    chunks_done: int
    language_code: str
    created_at: datetime
    transcript_chunks: list[TranscriptChunkResponse]
    summary: SummaryResponse | None


class UploadListItem(BaseModel):
    id: str
    filename: str
    status: str
    error_message: str | None
    summary_error: str | None = None
    duration_sec: float | None
    chunks_total: int
    chunks_done: int
    language_code: str
    created_at: datetime


class ChunksPollingResponse(BaseModel):
    """Response for GET /uploads/{id}/chunks?after=N — lightweight polling endpoint."""
    status: str
    chunks_done: int
    chunks_total: int
    chunks: list[TranscriptChunkResponse]  # only chunks with idx > after
    rolling_summary: str | None = None
    final_summary: str | None = None
    error_message: str | None = None
    summary_error: str | None = None
