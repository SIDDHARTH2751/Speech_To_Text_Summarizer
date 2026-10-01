"""
models.py — SQLAlchemy ORM models.
Three tables: uploads, transcript_chunks, summaries.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db import Base


def utcnow():
    return datetime.now(timezone.utc)


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename: Mapped[str] = mapped_column(String, nullable=False)
    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="queued")  # queued|processing|transcribing|summarizing|done|failed
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    chunks_total: Mapped[int] = mapped_column(Integer, default=0)
    chunks_done: Mapped[int] = mapped_column(Integer, default=0)
    language_code: Mapped[str] = mapped_column(String, default="en-IN")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    chunks: Mapped[list["TranscriptChunk"]] = relationship(back_populates="upload", order_by="TranscriptChunk.idx")
    summary: Mapped["Summary | None"] = relationship(back_populates="upload", uselist=False)


class TranscriptChunk(Base):
    __tablename__ = "transcript_chunks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    upload_id: Mapped[str] = mapped_column(ForeignKey("uploads.id"), nullable=False)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)  # chunk order, 0-based
    start_sec: Mapped[float] = mapped_column(Float, nullable=False)
    end_sec: Mapped[float] = mapped_column(Float, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    upload: Mapped["Upload"] = relationship(back_populates="chunks")


class Summary(Base):
    __tablename__ = "summaries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    upload_id: Mapped[str] = mapped_column(ForeignKey("uploads.id"), unique=True, nullable=False)
    rolling_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    upload: Mapped["Upload"] = relationship(back_populates="summary")
