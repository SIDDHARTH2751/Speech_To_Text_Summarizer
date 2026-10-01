"""
storage.py — File storage abstraction.
Currently saves to local disk. Swap save_file / get_file_path
for S3/R2/Supabase later without changing any caller code.
"""

import shutil
from pathlib import Path
from fastapi import UploadFile
from config import settings


def _ensure_dir():
    """Create storage directory if it doesn't exist."""
    settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)


async def save_file(key: str, upload: UploadFile) -> str:
    """
    Save an uploaded file to local storage.
    Returns the storage key (relative path).
    """
    _ensure_dir()
    dest = settings.STORAGE_DIR / key
    dest.parent.mkdir(parents=True, exist_ok=True)

    with open(dest, "wb") as f:
        # Read in chunks to handle large files without loading everything into memory
        while chunk := await upload.read(1024 * 1024):  # 1 MB chunks
            f.write(chunk)

    return key


def get_file_path(key: str) -> Path:
    """Get the absolute path to a stored file."""
    return settings.STORAGE_DIR / key
