"""
services/worker.py — Background job orchestrator.
Runs the full pipeline: validate → convert → split → transcribe.
Executed via asyncio.create_task() so it doesn't block the request.
"""

import logging
from sqlalchemy import select
from db import async_session
from models import Upload, TranscriptChunk
from storage import get_file_path
from services.audio import validate_audio, convert_to_wav, split_audio
from services.transcription import transcribe_chunk

logger = logging.getLogger(__name__)


async def process_upload(upload_id: str):
    """
    Full processing pipeline for an upload.
    Each step updates the DB so SSE clients can track progress in real time.
    """
    try:
        # ── Step 1: Validate ──────────────────────────────────────────
        await _update_status(upload_id, "processing")

        async with async_session() as session:
            upload = await session.get(Upload, upload_id)
            if not upload:
                logger.error(f"Upload {upload_id} not found")
                return
            file_path = get_file_path(upload.storage_key)
            language_code = upload.language_code

        try:
            audio_info = await validate_audio(file_path)
        except ValueError as e:
            await _fail(upload_id, f"Invalid audio file: {e}")
            return

        # Save duration
        async with async_session() as session:
            upload = await session.get(Upload, upload_id)
            upload.duration_sec = audio_info.duration_sec
            await session.commit()

        logger.info(f"Audio validated: {audio_info.duration_sec:.1f}s, {audio_info.format_name}")

        # ── Step 2: Convert to WAV ───────────────────────────────────
        try:
            wav_path = await convert_to_wav(file_path)
        except ValueError as e:
            await _fail(upload_id, f"Audio conversion failed: {e}")
            return

        # ── Step 3: Split into chunks ────────────────────────────────
        try:
            chunks = await split_audio(wav_path)
        except ValueError as e:
            await _fail(upload_id, f"Audio splitting failed: {e}")
            return

        # Update total chunks count
        async with async_session() as session:
            upload = await session.get(Upload, upload_id)
            upload.chunks_total = len(chunks)
            upload.status = "transcribing"
            await session.commit()

        logger.info(f"Split into {len(chunks)} chunks, starting transcription")

        # ── Step 4: Transcribe each chunk ────────────────────────────
        for chunk_info in chunks:
            try:
                text = await transcribe_chunk(chunk_info.path, language_code)
            except RuntimeError as e:
                await _fail(upload_id, f"Transcription failed on chunk {chunk_info.index}: {e}")
                return

            # Save chunk to DB
            async with async_session() as session:
                chunk = TranscriptChunk(
                    upload_id=upload_id,
                    idx=chunk_info.index,
                    start_sec=chunk_info.start_sec,
                    end_sec=chunk_info.end_sec,
                    text=text,
                )
                session.add(chunk)

                # Update progress
                upload = await session.get(Upload, upload_id)
                upload.chunks_done = chunk_info.index + 1
                await session.commit()

            logger.info(f"Chunk {chunk_info.index + 1}/{len(chunks)} transcribed")

        # ── Step 5: Mark as done (Phase 3 will add summarization) ────
        # For now, skip summarizing step — go straight to done
        await _update_status(upload_id, "done")
        logger.info(f"Upload {upload_id} processing complete")

    except Exception as e:
        logger.exception(f"Unexpected error processing upload {upload_id}")
        await _fail(upload_id, f"Unexpected error: {str(e)[:200]}")


async def _update_status(upload_id: str, status: str):
    """Helper to update just the status field."""
    async with async_session() as session:
        upload = await session.get(Upload, upload_id)
        if upload:
            upload.status = status
            await session.commit()


async def _fail(upload_id: str, error_message: str):
    """Mark upload as failed with an error message."""
    logger.error(f"Upload {upload_id} failed: {error_message}")
    async with async_session() as session:
        upload = await session.get(Upload, upload_id)
        if upload:
            upload.status = "failed"
            upload.error_message = error_message
            await session.commit()
