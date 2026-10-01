/**
 * api.ts — Centralised API layer.
 * All backend calls live here. Uses real fetch() calls to FastAPI.
 * SSE streaming via EventSource for live transcript updates.
 */

import {
  Upload,
  UploadResponse,
  ProgressCallback,
  StreamCallbacks,
  JobStatus,
  TranscriptChunk,
} from "@/types";

// ── Upload ────────────────────────────────────────────────────────

/**
 * Upload an audio file to the backend.
 * Uses XMLHttpRequest for upload progress tracking.
 */
export function uploadAudio(
  file: File,
  languageCode: string,
  onProgress: ProgressCallback
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language_code", languageCode);

    // Track upload progress
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        const msg =
          xhr.responseText
            ? JSON.parse(xhr.responseText).detail || "Upload failed"
            : `Upload failed (HTTP ${xhr.status})`;
        reject(new Error(msg));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));

    xhr.timeout = 5 * 60 * 1000; // 5 min timeout for large files
    xhr.open("POST", "/api/uploads");
    xhr.send(formData);
  });
}

// ── SSE Stream ────────────────────────────────────────────────────

/**
 * Subscribe to live updates for an upload via Server-Sent Events.
 * Returns a cleanup function to close the connection.
 */
export function subscribeToStream(
  uploadId: string,
  callbacks: StreamCallbacks
): () => void {
  const source = new EventSource(`/api/uploads/${uploadId}/stream`);

  source.addEventListener("status", (e) => {
    const data = JSON.parse(e.data);
    callbacks.onStatus?.(data.status as JobStatus);
  });

  source.addEventListener("progress", (e) => {
    const data = JSON.parse(e.data);
    callbacks.onProgress?.(data.chunks_done, data.chunks_total);
  });

  source.addEventListener("transcript_chunk", (e) => {
    const data = JSON.parse(e.data) as TranscriptChunk;
    callbacks.onTranscriptChunk?.(data);
  });

  source.addEventListener("summary_update", (e) => {
    const data = JSON.parse(e.data);
    callbacks.onSummaryUpdate?.(data);
  });

  source.addEventListener("done", () => {
    callbacks.onDone?.();
    source.close();
  });

  source.addEventListener("error", (e) => {
    // EventSource fires 'error' for both connection issues and server-sent error events
    // Check if it's a MessageEvent (server-sent) or a connection error
    if (e instanceof MessageEvent) {
      const data = JSON.parse(e.data);
      callbacks.onError?.(data.message || "Unknown error");
    } else {
      // Connection error — EventSource auto-reconnects, but if readyState is CLOSED, it won't
      if (source.readyState === EventSource.CLOSED) {
        callbacks.onError?.("Connection lost. Please refresh.");
      }
    }
    source.close();
  });

  // Return cleanup function
  return () => source.close();
}

// ── REST endpoints ────────────────────────────────────────────────

/** Fetch the list of past uploads. */
export async function fetchUploads(): Promise<Upload[]> {
  const res = await fetch("/api/uploads");
  if (!res.ok) throw new Error("Failed to load uploads");
  return res.json();
}

/** Fetch a single upload by id (includes transcript chunks + summary). */
export async function fetchUploadById(id: string): Promise<Upload | null> {
  const res = await fetch(`/api/uploads/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load upload");
  return res.json();
}
