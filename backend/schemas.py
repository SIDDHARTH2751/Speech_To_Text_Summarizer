"""
schemas.py — Pydantic models for API request/response shapes.
"""

from pydantic import BaseModel
from datetime import datetime


# ── Request ──────────────────────────────────────────────

class UploadCreate(BaseModel):
    language_code: str = "en-IN"


# ── Response ─────────────────────────────────────────────

class UploadResponse(BaseModel):
    id: str
    status: str


class TranscriptChunkResponse(BaseModel):
    idx: int
    start_sec: float
    end_sec: float
    text: str


class SummaryResponse(BaseModel):
    rolling_summary: str | None
    final_summary: str | None


class UploadDetail(BaseModel):
    id: str
    filename: str
    file_size: int | None = None
    status: str
    error_message: str | None
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
    duration_sec: float | None
    chunks_total: int
    chunks_done: int
    language_code: str
    created_at: datetime
