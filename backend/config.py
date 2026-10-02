"""
config.py — All configuration loaded from environment variables.
Uses pydantic-settings so a missing .env file doesn't crash the app.
"""

from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./audio_notes.db"

    # Gnani ASR
    GNANI_API_KEY: str = ""
    GNANI_API_URL: str = "https://api.vachana.ai/stt/v3"
    GNANI_DEFAULT_LANG: str = "en-IN"

    # Groq LLM (for summarization)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "qwen/qwen3.8-27b"

    # File storage
    STORAGE_DIR: Path = Path("./uploads_storage")

    # Audio processing
    CHUNK_DURATION_SEC: int = 8       # ~8s chunks stay well under Gnani's 30s limit
    TRANSCRIPTION_CONCURRENCY: int = 1  # max parallel Gnani API calls (lowered to avoid 429s)
    SUMMARY_BATCH_CHUNKS: int = 4     # trigger rolling summary every 4 chunks (~32s of audio)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
