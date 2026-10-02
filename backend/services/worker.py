"""
services/worker.py — Background job orchestrator.

Pipeline: validate → convert+split → transcribe (concurrent) → summarize → cleanup.
Executed via asyncio.create_task() so it doesn't block the upload request.

Key design decisions:
- Semaphore(3) limits concurrent Gnani calls to avoid rate-limiting.
- Per-chunk error handling: failed chunks are marked individually, not fatal.
- Rolling summary is batched every ~4 chunks (~32s of audio) to reduce Groq calls.
- Chunk temp files are cleaned up after processing.
"""

import asyncio
import logging
from sqlalchemy import select
from db import async_session
from models import Upload, TranscriptChunk, Summary
from storage import get_file_path
from services.audio import validate_audio, convert_and_split, cleanup_chunks
from services.transcription import transcribe_chunk
from services.summarization import update_rolling_summary, generate_final_summary
from config import settings

logger = logging.getLogger(__name__)

# Semaphore to limit concurrent Gnani API calls
_transcription_sem = asyncio.Semaphore(settings.TRANSCRIPTION_CONCURRENCY)


async def process_upload(upload_id: str):
    """
    Full processing pipeline for an upload.
    Each step updates the DB so polling clients can track progress in real time.
    """
    file_path = None
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

        # ── Step 2: Convert + Split into ~8s chunks ──────────────────
        try:
            chunk_infos = await convert_and_split(file_path)
        except ValueError as e:
            await _fail(upload_id, f"Audio processing failed: {e}")
            return

        # Pre-create all TranscriptChunk rows as "pending" so the frontend
        # knows the total immediately and can show placeholders.
        async with async_session() as session:
            for ci in chunk_infos:
                chunk = TranscriptChunk(
                    upload_id=upload_id,
                    idx=ci.index,
                    start_sec=ci.start_sec,
                    end_sec=ci.end_sec,
                    text="",
                    status="pending",
                )
                session.add(chunk)
            upload = await session.get(Upload, upload_id)
            upload.chunks_total = len(chunk_infos)
            upload.status = "transcribing"
            await session.commit()

        logger.info(f"Split into {len(chunk_infos)} chunks, starting transcription")

        # ── Step 3: Transcribe concurrently with Semaphore ───────────
        # Each task writes its own result to DB. We collect outcomes to know
        # which chunks succeeded/failed.
        results: dict[int, str | None] = {}  # idx -> text or None if failed
        failed_count = 0

        async def transcribe_one(ci):
            """Transcribe a single chunk with bounded concurrency."""
            nonlocal failed_count
            async with _transcription_sem:
                try:
                    text = await transcribe_chunk(ci.path, language_code)
                    # Save successful result
                    async with async_session() as session:
                        result = await session.execute(
                            select(TranscriptChunk)
                            .where(TranscriptChunk.upload_id == upload_id)
                            .where(TranscriptChunk.idx == ci.index)
                        )
                        chunk = result.scalar_one()
                        chunk.text = text
                        chunk.status = "done"
                        # Increment chunks_done
                        upload = await session.get(Upload, upload_id)
                        upload.chunks_done += 1
                        await session.commit()

                    results[ci.index] = text
                    logger.info(f"Chunk {ci.index + 1}/{len(chunk_infos)} transcribed")

                except Exception as e:
                    error_msg = str(e)[:200]
                    # Mark chunk as failed but continue with the rest
                    async with async_session() as session:
                        result = await session.execute(
                            select(TranscriptChunk)
                            .where(TranscriptChunk.upload_id == upload_id)
                            .where(TranscriptChunk.idx == ci.index)
                        )
                        chunk = result.scalar_one()
                        chunk.status = "failed"
                        chunk.error = error_msg
                        upload = await session.get(Upload, upload_id)
                        upload.chunks_done += 1
                        await session.commit()

                    results[ci.index] = None
                    failed_count += 1
                    logger.warning(f"Chunk {ci.index} failed: {error_msg}")

        # Launch all transcription tasks (semaphore limits to 3 at a time)
        tasks = [asyncio.create_task(transcribe_one(ci)) for ci in chunk_infos]
        await asyncio.gather(*tasks)

        # ── Step 3b: Batched rolling summary ─────────────────────────
        # Process transcribed chunks in idx order, batching every SUMMARY_BATCH_CHUNKS
        rolling_summary = ""
        batch_text = ""
        batch_count = 0

        for idx in range(len(chunk_infos)):
            text = results.get(idx)
            if text:  # skip failed chunks
                batch_text += " " + text
                batch_count += 1

                # Trigger summary every SUMMARY_BATCH_CHUNKS
                if batch_count >= settings.SUMMARY_BATCH_CHUNKS:
                    rolling_summary = await update_rolling_summary(rolling_summary, batch_text.strip())
                    await _upsert_summary(upload_id, rolling_summary=rolling_summary)
                    batch_text = ""
                    batch_count = 0

        # Process any leftover text
        if batch_text.strip():
            rolling_summary = await update_rolling_summary(rolling_summary, batch_text.strip())
            await _upsert_summary(upload_id, rolling_summary=rolling_summary)

        # ── Step 4: Final summary ────────────────────────────────────
        await _update_status(upload_id, "summarizing")

        # Collect full transcript from successful chunks in order
        full_transcript = " ".join(
            results[i] for i in sorted(results.keys()) if results[i]
        )

        try:
            final = await generate_final_summary(rolling_summary, full_transcript)
            await _upsert_summary(upload_id, final_summary=final)
        except Exception as e:
            # Summary failed — don't crash the whole upload, transcript is still usable
            logger.error(f"Final summary generation failed: {e}")
            async with async_session() as session:
                upload = await session.get(Upload, upload_id)
                upload.summary_error = f"Summary generation failed: {str(e)[:200]}"
                await session.commit()

        # ── Step 5: Done ─────────────────────────────────────────────
        final_status = "completed_with_errors" if failed_count > 0 else "done"
        await _update_status(upload_id, final_status)
        logger.info(f"Upload {upload_id} complete (status={final_status}, failed_chunks={failed_count})")

    except Exception as e:
        logger.exception(f"Unexpected error processing upload {upload_id}")
        await _fail(upload_id, f"Unexpected error: {str(e)[:200]}")

    finally:
        # Clean up temp chunk files
        if file_path:
            cleanup_chunks(file_path)


async def run_summarize(upload_id: str):
    """
    Re-run summarization for an upload whose summary previously failed.
    Called by POST /uploads/{id}/summarize.
    """
    async with async_session() as session:
        upload = await session.get(Upload, upload_id)
        if not upload:
            raise ValueError("Upload not found")

        # Collect transcript from successful chunks
        result = await session.execute(
            select(TranscriptChunk)
            .where(TranscriptChunk.upload_id == upload_id)
            .where(TranscriptChunk.status == "done")
            .order_by(TranscriptChunk.idx)
        )
        chunks = result.scalars().all()
        if not chunks:
            raise ValueError("No transcript chunks available")

        full_transcript = " ".join(c.text for c in chunks)

    # Build rolling summary from scratch
    rolling = ""
    batch_text = ""
    batch_count = 0

    for chunk in chunks:
        batch_text += " " + chunk.text
        batch_count += 1
        if batch_count >= settings.SUMMARY_BATCH_CHUNKS:
            rolling = await update_rolling_summary(rolling, batch_text.strip())
            batch_text = ""
            batch_count = 0

    if batch_text.strip():
        rolling = await update_rolling_summary(rolling, batch_text.strip())

    # Generate final summary
    final = await generate_final_summary(rolling, full_transcript)

    # Save and clear error
    await _upsert_summary(upload_id, rolling_summary=rolling, final_summary=final)
    async with async_session() as session:
        upload = await session.get(Upload, upload_id)
        upload.summary_error = None
        await session.commit()


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


async def _upsert_summary(upload_id: str, rolling_summary: str | None = None, final_summary: str | None = None):
    """Create or update the summary row for an upload."""
    async with async_session() as session:
        result = await session.execute(
            select(Summary).where(Summary.upload_id == upload_id)
        )
        summary = result.scalar_one_or_none()

        if summary:
            if rolling_summary is not None:
                summary.rolling_summary = rolling_summary
            if final_summary is not None:
                summary.final_summary = final_summary
        else:
            summary = Summary(
                upload_id=upload_id,
                rolling_summary=rolling_summary or "",
                final_summary=final_summary,
            )
            session.add(summary)

        await session.commit()
