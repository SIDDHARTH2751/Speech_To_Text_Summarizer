"""
main.py — FastAPI application entry point.
Sets up CORS, includes routers, and initializes the DB on startup.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from routers import uploads

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run on startup: create DB tables."""
    await init_db()
    logging.info("Database tables created")
    yield


app = FastAPI(
    title="Audio Notes API",
    description="Upload audio files, get transcripts and AI summaries",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow the Next.js frontend (dev and prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(uploads.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/debug/s3")
async def debug_s3():
    """Test S3 connectivity — remove this endpoint after debugging."""
    from storage import s3_client
    from config import settings
    if not s3_client:
        return {"s3": "not configured", "bucket": settings.AWS_BUCKET_NAME, "endpoint": settings.AWS_ENDPOINT_URL}
    try:
        response = s3_client.list_buckets()
        buckets = [b["Name"] for b in response.get("Buckets", [])]
        return {"s3": "connected", "buckets": buckets, "target_bucket": settings.AWS_BUCKET_NAME}
    except Exception as e:
        return {"s3": "error", "error": str(e)[:500]}
