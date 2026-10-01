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
    GROQ_MODEL: str = "qwen/qwen3.8-27b"  # Fast model, called per chunk

    # File storage
    STORAGE_DIR: Path = Path("./uploads_storage")

    # Audio processing
    CHUNK_DURATION_SEC: int = 30  # Split audio into chunks of this length

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
