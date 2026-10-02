"""
services/transcription.py — Gnani ASR API client.
Sends audio chunks to the Gnani speech-to-text REST endpoint.
Includes retry with exponential backoff.
"""

import asyncio
import logging
from pathlib import Path
import httpx
from config import settings

logger = logging.getLogger(__name__)

# Retry config
MAX_RETRIES = 3
BASE_DELAY = 1  # seconds (1s, 2s, 4s)
TIMEOUT = 60     # seconds per request


async def transcribe_chunk(file_path: Path, language_code: str) -> str:
    """
    Send a single audio chunk to Gnani ASR and return the transcript text.
    Retries up to MAX_RETRIES times with exponential backoff on failure.

    Raises:
        RuntimeError: If all retries are exhausted.
    """
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                with open(file_path, "rb") as f:
                    response = await client.post(
                        settings.GNANI_API_URL,
                        headers={"X-API-Key-ID": settings.GNANI_API_KEY},
                        files={"audio_file": (file_path.name, f, "audio/wav")},
                        data={"language_code": language_code, "format": "verbatim"},
                    )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        transcript = data.get("transcript", "")
                        logger.info(f"Transcribed {file_path.name}: {len(transcript)} chars")
                        return transcript
                    else:
                        raise RuntimeError(f"Gnani returned success=false: {data}")

                elif response.status_code == 429:
                    # Rate limited — wait longer
                    logger.warning(f"Rate limited by Gnani (attempt {attempt + 1})")
                    last_error = f"Rate limited (429): {response.text[:100]}"
                elif response.status_code >= 500:
                    # Server error — retryable
                    logger.warning(f"Gnani server error {response.status_code} (attempt {attempt + 1})")
                    last_error = f"Server error ({response.status_code})"
                else:
                    # Client error (400, 403) — not retryable
                    raise RuntimeError(
                        f"Gnani API error {response.status_code}: {response.text[:200]}"
                    )

        except httpx.TimeoutException:
            logger.warning(f"Gnani request timed out (attempt {attempt + 1})")
            last_error = "Request timed out"
        except RuntimeError:
            raise  # Don't retry client errors
        except Exception as e:
            logger.warning(f"Unexpected error calling Gnani (attempt {attempt + 1}): {e}")
            last_error = str(e)

        # Exponential backoff before retry
        if attempt < MAX_RETRIES - 1:
            delay = BASE_DELAY * (2 ** attempt)
            logger.info(f"Retrying in {delay}s...")
            await asyncio.sleep(delay)

    raise RuntimeError(f"Gnani transcription failed after {MAX_RETRIES} attempts: {last_error}")
