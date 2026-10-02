/**
 * types/index.ts — Shared TypeScript types for the frontend.
 */

// All possible job statuses from the backend
export type JobStatus =
  | "queued"
  | "processing"
  | "transcribing"
  | "summarizing"
  | "done"
  | "completed_with_errors"
  | "failed";

// A single transcript chunk with per-chunk status tracking
export interface TranscriptChunk {
  idx: number;
  start_sec: number;
  end_sec: number;
  text: string;
  status: "pending" | "done" | "failed";
  error?: string | null;
}

// Response from GET /uploads/{id}/chunks?after=N
export interface ChunksPollingResponse {
  status: JobStatus;
  chunks_done: number;
  chunks_total: number;
  chunks: TranscriptChunk[];
  rolling_summary: string | null;
  final_summary: string | null;
  error_message: string | null;
  summary_error: string | null;
}

// Full upload detail from GET /uploads/{id}
export interface Upload {
  id: string;
  filename: string;
  status: JobStatus;
  error_message: string | null;
  summary_error?: string | null;
  duration_sec: number | null;
  chunks_total: number;
  chunks_done: number;
  language_code: string;
  created_at: string;
  transcript_chunks?: TranscriptChunk[];
  summary?: {
    rolling_summary: string | null;
    final_summary: string | null;
  } | null;
}

// Supported languages for the Gnani ASR API
export const SUPPORTED_LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "mr-IN", label: "Marathi" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "en-US", label: "English (US)" },
];

// Max file size for upload (200 MB)
export const MAX_FILE_SIZE = 200 * 1024 * 1024;
