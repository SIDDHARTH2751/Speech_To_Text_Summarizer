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
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(uploads.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
