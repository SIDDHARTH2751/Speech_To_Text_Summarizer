"""
services/audio.py — Audio validation, conversion, and chunking using ffmpeg/ffprobe.
"""

import asyncio
import json
import logging
import os
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
    path: Path
    index: int
    start_sec: float
    end_sec: float


import subprocess

async def _run_cmd(cmd: list[str]) -> tuple[int, str, str]:
    """Run a shell command synchronously in a thread and return (returncode, stdout, stderr)."""
    def run():
        return subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
    
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
        raise ValueError(f"File is corrupt or not a valid audio file: {stderr.strip()}")

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


async def convert_to_wav(file_path: Path) -> Path:
    """
    Convert any audio file to mono 16kHz WAV — the ideal format for Gnani ASR.
    Returns path to the converted file.
    """
    output_path = file_path.with_suffix(".converted.wav")

    cmd = [
        "ffmpeg", "-y",         # overwrite if exists
        "-i", str(file_path),
        "-ac", "1",              # mono
        "-ar", "16000",          # 16kHz sample rate
        "-sample_fmt", "s16",    # 16-bit PCM
        str(output_path),
    ]
    returncode, _, stderr = await _run_cmd(cmd)

    if returncode != 0:
        raise ValueError(f"Audio conversion failed: {stderr.strip()[:200]}")

    return output_path


async def split_audio(file_path: Path, chunk_duration: int | None = None) -> list[ChunkInfo]:
    """
    Split audio into chunks of `chunk_duration` seconds using ffmpeg.
    Returns list of ChunkInfo with file paths and time offsets.

    If the audio is shorter than chunk_duration, returns a single chunk.
    """
    chunk_sec = chunk_duration or settings.CHUNK_DURATION_SEC

    # Get total duration first
    info = await validate_audio(file_path)
    total_duration = info.duration_sec

    # If short enough, no splitting needed
    if total_duration <= chunk_sec + 5:  # +5s tolerance to avoid tiny last chunks
        return [ChunkInfo(path=file_path, index=0, start_sec=0.0, end_sec=total_duration)]

    chunks: list[ChunkInfo] = []
    chunk_dir = file_path.parent / f"{file_path.stem}_chunks"
    chunk_dir.mkdir(exist_ok=True)

    # Use ffmpeg segment to split
    output_pattern = str(chunk_dir / "chunk_%03d.wav")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(file_path),
        "-f", "segment",
        "-segment_time", str(chunk_sec),
        "-c", "copy",
        output_pattern,
    ]
    returncode, _, stderr = await _run_cmd(cmd)

    if returncode != 0:
        raise ValueError(f"Audio splitting failed: {stderr.strip()[:200]}")

    # Collect the generated chunk files
    chunk_files = sorted(chunk_dir.glob("chunk_*.wav"))

    for i, chunk_path in enumerate(chunk_files):
        start = i * chunk_sec
        end = min(start + chunk_sec, total_duration)
        chunks.append(ChunkInfo(path=chunk_path, index=i, start_sec=start, end_sec=end))

    logger.info(f"Split audio into {len(chunks)} chunks of ~{chunk_sec}s each")
    return chunks
