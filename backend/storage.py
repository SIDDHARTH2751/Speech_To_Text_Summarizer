"""
storage.py — File storage abstraction.
Supports both AWS S3 (if configured) and local disk fallback.
"""

import os
import shutil
import asyncio
from pathlib import Path
from fastapi import UploadFile
from config import settings

# Initialize S3 client only if configured
s3_client = None
if settings.AWS_BUCKET_NAME and settings.AWS_ACCESS_KEY_ID:
    import boto3
    s3_client = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
        endpoint_url=settings.AWS_ENDPOINT_URL
    )

def _ensure_dir():
    """Create local storage directory if it doesn't exist."""
    settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

async def save_file(key: str, upload: UploadFile) -> str:
    """
    Save an uploaded file to S3 (if configured) or local storage.
    Returns the storage key.
    """
    if s3_client:
        # Upload to S3 in a background thread so we don't block the event loop
        def _upload_to_s3():
            s3_client.upload_fileobj(upload.file, settings.AWS_BUCKET_NAME, key)
        
        await asyncio.to_thread(_upload_to_s3)
        return key

    # Fallback: Local storage
    _ensure_dir()
    dest = settings.STORAGE_DIR / key
    dest.parent.mkdir(parents=True, exist_ok=True)

    with open(dest, "wb") as f:
        while chunk := await upload.read(1024 * 1024):  # 1 MB chunks
            f.write(chunk)

    return key

async def download_file_for_processing(key: str, temp_dir: Path) -> Path:
    """
    If using S3, downloads the file to temp_dir and returns the path.
    If using local storage, just returns the existing local path.
    """
    if s3_client:
        dest = temp_dir / Path(key).name
        def _download_from_s3():
            s3_client.download_file(settings.AWS_BUCKET_NAME, key, str(dest))
        
        await asyncio.to_thread(_download_from_s3)
        return dest
    
    # Local fallback
    return settings.STORAGE_DIR / key
