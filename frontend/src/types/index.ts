// All shared types for the Audio Notes Platform

/** Possible states of a processing job */
export type JobStatus =
  | "uploading"
  | "queued"
  | "transcribing"
  | "summarizing"
  | "done"
  | "failed";

/** A single upload record */
export interface Upload {
  id: string;
  fileName: string;
  fileSize: number; // bytes
  status: JobStatus;
  createdAt: string; // ISO date string
  transcript: string | null;
  summary: string | null;
  errorMessage: string | null;
}

/** Response shape from the upload endpoint */
export interface UploadResponse {
  id: string;
  status: JobStatus;
}

/** Progress callback used during file upload */
export type ProgressCallback = (percent: number) => void;
