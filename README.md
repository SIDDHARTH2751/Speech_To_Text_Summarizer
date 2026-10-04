# Architecture Documentation: Upload to Transcript Flow

## Overview
This document outlines the end-to-end architecture for processing audio uploads, performing concurrent speech-to-text (STT) transcription, generating rolling and final summaries, and handling real-time frontend updates.

---

## 1. Upload to Transcript Flow

* **Upload:** The user drops an audio file. A `POST /api/uploads` request saves it to local storage, creates a database row with `status=queued`, and returns the upload ID immediately.
* **Background Job:** An `asyncio.create_task` picks up the upload. It validates the file using `ffprobe`, then converts and splits it into approximately 8-second mono 16kHz WAV chunks using `ffmpeg`'s segment muxer.
* **Concurrent Transcription:** Up to 3 chunks are transcribed in parallel via `asyncio.Semaphore(3)`. Each chunk is sent to the Gnani REST API, and results are saved to the database per-chunk as they complete.
* **Rolling Summary:** Every 4 chunks (~32 seconds of audio), the new transcript text is merged into a rolling summary via Groq's LLM API. This runs asynchronously without blocking transcription.
* **Final Summary:** Once all chunks finish processing, a final LLM call polishes the rolling summary into a structured final summary with bullet points.
* **Frontend Polling:** The UI polls `GET /api/uploads/{id}/chunks?after=N` every 2 seconds. Each response only includes new chunks (`idx > N`), keeping polling lightweight.

---

## 2. Audio Chunking Strategy

* **Why chunk?** The Gnani REST API enforces a 30-second limit. Splitting audio into ~8s chunks, transcribing them with bounded concurrency, and saving them per chunk allows the UI to update dynamically via polling. 
* **Re-encoding:** Re-encoding (rather than stream copying) during splitting guarantees exact chunk durations.

---

## 3. File Storage Layout

* **Original audio:** `uploads_storage/{upload_id}/original.mp3` (managed behind a `storage.py` interface to allow seamless migration to S3/R2 later).
* **Temp chunks:** `uploads_storage/{upload_id}/original_chunks/chunk_000.wav` (automatically deleted after processing).
* **Database:** SQLite (development environment) via async SQLAlchemy.
* **Core Tables:** `uploads`, `transcript_chunks`, `summaries`.

---

## 4. Sync vs. Background Processing

The upload request returns immediately. All heavy lifting—including `ffmpeg` processing, Gnani API calls, and LLM requests—runs inside a background `asyncio.create_task`. This keeps the API responsive and enables real-time progress tracking on the frontend. 

*Note: For production environments, this pattern should be replaced with a durable task queue like Celery or ARQ to ensure reliability and horizontal scaling.*

---

## 5. Error Handling & Resilience

* **Per-Chunk Error Handling:** If an individual chunk fails after 3 retries, it is marked as `failed` individually, allowing the remaining chunks to continue. 
* **Status Handling:** The upload finishes with a status of `completed_with_errors` rather than failing entirely. 
* **UI & Recovery:** The UI renders inline markers for failed sections, and failed summaries can be retried manually via a dedicated button.

---

## 6. Production Roadmap (What to Do Differently)

* Use Gnani's Batch STT API (which supports up to 4 hours of audio and returns native timestamps) instead of manual chunking.
* Replace SQLite with PostgreSQL and `asyncio.create_task` with a durable queue (Celery + Redis or ARQ).
* Move file storage to S3 or Cloudflare R2 using pre-signed URLs.
* Implement WebSockets or Server-Sent Events (SSE) for true real-time push updates instead of polling.
* Add user authentication and rate limiting.

---

## 7. Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | Next.js 15, TypeScript, Tailwind CSS v3 |
| **Backend** | FastAPI, async SQLAlchemy, Postgres |
| **STT** | Gnani Vachana REST API |
| **LLM** | Groq (Qwen 3.8 27B) |
| **Audio Processing** | ffmpeg / ffprobe |
| **Updates** | Polling (`GET /chunks?after=N`) |
