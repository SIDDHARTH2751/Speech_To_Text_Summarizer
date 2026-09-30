// ── Upload constraints ──────────────────────────────────────────

/** Maximum upload size in bytes (200 MB) */
export const MAX_FILE_SIZE = 200 * 1024 * 1024;

/** Human-readable max size for error messages */
export const MAX_FILE_SIZE_LABEL = "200 MB";

/** Accepted MIME types for audio uploads */
export const ACCEPTED_AUDIO_TYPES = [
  "audio/mpeg",    // .mp3
  "audio/wav",     // .wav
  "audio/x-wav",
  "audio/mp4",     // .m4a
  "audio/x-m4a",
  "audio/ogg",     // .ogg
  "audio/webm",    // .webm
] as const;

/** File extensions shown in the dropzone hint */
export const ACCEPTED_EXTENSIONS = ".mp3, .wav, .m4a, .ogg, .webm";

// ── API base URL (swap for production) ──────────────────────────
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
