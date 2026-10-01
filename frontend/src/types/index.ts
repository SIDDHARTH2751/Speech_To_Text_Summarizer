// All shared types for the Audio Notes Platform

/** Possible states of a processing job */
export type JobStatus =
  | "queued"
  | "processing"
  | "transcribing"
  | "summarizing"
  | "done"
  | "failed";

/** A transcript chunk returned by the API */
export interface TranscriptChunk {
  idx: number;
  start_sec: number;
  end_sec: number;
  text: string;
}

/** Summary data */
export interface SummaryData {
  rolling_summary: string | null;
  final_summary: string | null;
}

/** A single upload record (from GET /api/uploads or GET /api/uploads/:id) */
export interface Upload {
  id: string;
  filename: string;
  status: JobStatus;
  error_message: string | null;
  duration_sec: number | null;
  chunks_total: number;
  chunks_done: number;
  language_code: string;
  created_at: string;
  transcript_chunks?: TranscriptChunk[];
  summary?: SummaryData | null;
}

/** Response from POST /api/uploads */
export interface UploadResponse {
  id: string;
  status: JobStatus;
}

/** Progress callback used during file upload */
export type ProgressCallback = (percent: number) => void;

/** SSE event callbacks */
export interface StreamCallbacks {
  onStatus?: (status: JobStatus) => void;
  onProgress?: (chunksDone: number, chunksTotal: number) => void;
  onTranscriptChunk?: (chunk: TranscriptChunk) => void;
  onSummaryUpdate?: (summary: SummaryData) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

/** Supported Gnani languages */
export const SUPPORTED_LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
] as const;
