"""
services/audio.py — Audio validation, conversion, and chunking using ffmpeg/ffprobe.

Key design decisions:
- Chunks are 8s (configurable) to stay well under Gnani's 30s limit.
- We re-encode during splitting (not -c copy) so every chunk has exact
  duration and valid WAV headers. -c copy can overshoot due to codec frames.
- Chunk files are stored in a temp dir per upload and cleaned up after processing.
"""

import asyncio
import json
import logging
import os
import shutil
import subprocess
from pathlib import Path
from dataclasses import dataclass
from config import settings

logger = logging.getLogger(__name__)

# Add winget's ffmpeg bin to PATH if it exists (for Windows)
ffmpeg_dir = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin"
if ffmpeg_dir.exists():
    os.environ["PATH"] = f"{ffmpeg_dir};{os.environ.get('PATH', '')}"


@dataclass
class AudioInfo:
    duration_sec: float
    format_name: str
    sample_rate: int
    channels: int


@dataclass
class ChunkInfo:
    """Metadata for a single audio chunk on disk."""
    path: Path
    index: int
    start_sec: float
    end_sec: float


async def _run_cmd(cmd: list[str]) -> tuple[int, str, str]:
    """Run a shell command in a thread (Windows asyncio compat) and return (rc, stdout, stderr)."""
    def run():
        return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    proc = await asyncio.to_thread(run)
    return proc.returncode, proc.stdout, proc.stderr


async def validate_audio(file_path: Path) -> AudioInfo:
    """
    Use ffprobe to validate audio and extract metadata.
    Raises ValueError on corrupt or non-audio files.
    """
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        str(file_path),
    ]
    returncode, stdout, stderr = await _run_cmd(cmd)

    if returncode != 0:
        raise ValueError(f"File is corrupt or not a valid audio file: {stderr.strip()[:200]}")

    try:
        probe = json.loads(stdout)
    except json.JSONDecodeError:
        raise ValueError("ffprobe returned invalid output")

    # Find the audio stream
    audio_stream = None
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "audio":
            audio_stream = stream
            break

    if not audio_stream:
        raise ValueError("No audio stream found in file")

    duration = float(probe.get("format", {}).get("duration", 0))
    if duration <= 0:
        raise ValueError("Audio file has zero or negative duration")

    return AudioInfo(
        duration_sec=duration,
        format_name=probe.get("format", {}).get("format_name", "unknown"),
        sample_rate=int(audio_stream.get("sample_rate", 16000)),
        channels=int(audio_stream.get("channels", 1)),
    )


async def convert_and_split(file_path: Path, chunk_duration: int | None = None) -> list[ChunkInfo]:
    """
    Convert to mono 16kHz WAV and split into ~chunk_duration-second chunks in one pass.

    Uses ffmpeg's segment muxer with re-encoding so every chunk has:
    - Exact duration (no overshoot from codec frame alignment)
    - Valid WAV headers that Gnani can read
    - Mono 16kHz pcm_s16le format (Gnani's preferred input)

    Returns list of ChunkInfo sorted by index.
    """
    chunk_sec = chunk_duration or settings.CHUNK_DURATION_SEC

    # Get total duration for metadata
    info = await validate_audio(file_path)
    total_duration = info.duration_sec

    # Create a temp dir for this upload's chunks
    chunk_dir = file_path.parent / f"{file_path.stem}_chunks"
    chunk_dir.mkdir(exist_ok=True)

    # If file is shorter than one chunk, just convert it directly
    if total_duration <= chunk_sec:
        output = chunk_dir / "chunk_000.wav"
        cmd = [
            "ffmpeg", "-y", "-i", str(file_path),
            "-ac", "1", "-ar", "16000", "-sample_fmt", "s16",
            str(output),
        ]
        rc, _, stderr = await _run_cmd(cmd)
        if rc != 0:
            raise ValueError(f"Audio conversion failed: {stderr.strip()[:200]}")
        return [ChunkInfo(path=output, index=0, start_sec=0.0, end_sec=total_duration)]

    # Convert + split in one ffmpeg call using the segment muxer.
    # Re-encoding (not -c copy) guarantees exact chunk durations.
    output_pattern = str(chunk_dir / "chunk_%03d.wav")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(file_path),
        "-ac", "1",               # mono
        "-ar", "16000",           # 16kHz
        "-sample_fmt", "s16",     # 16-bit PCM
        "-f", "segment",
        "-segment_time", str(chunk_sec),
        output_pattern,
    ]
    rc, _, stderr = await _run_cmd(cmd)
    if rc != 0:
        raise ValueError(f"Audio splitting failed: {stderr.strip()[:200]}")

    # Collect the generated chunk files
    chunk_files = sorted(chunk_dir.glob("chunk_*.wav"))
    chunks = []
    for i, chunk_path in enumerate(chunk_files):
        start = i * chunk_sec
        end = min(start + chunk_sec, total_duration)
        chunks.append(ChunkInfo(path=chunk_path, index=i, start_sec=start, end_sec=end))

    logger.info(f"Split audio into {len(chunks)} chunks of ~{chunk_sec}s each")
    return chunks


def cleanup_chunks(file_path: Path):
    """Delete the temp chunk directory for a given upload file. Safe to call multiple times."""
    chunk_dir = file_path.parent / f"{file_path.stem}_chunks"
    if chunk_dir.exists():
        shutil.rmtree(chunk_dir, ignore_errors=True)
        logger.info(f"Cleaned up chunk dir: {chunk_dir}")
