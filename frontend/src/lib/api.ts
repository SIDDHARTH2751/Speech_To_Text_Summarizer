/**
 * lib/api.ts — All API calls in one file.
 *
 * uploadAudio     — POST /api/uploads (XHR for progress)
 * fetchUploads    — GET  /api/uploads
 * fetchUploadById — GET  /api/uploads/{id}
 * pollChunks      — GET  /api/uploads/{id}/chunks?after=N (lightweight polling)
 * retrySummary    — POST /api/uploads/{id}/summarize
 */

import { Upload, ChunksPollingResponse } from "@/types";

const API_BASE = "/api";

// ── Upload with progress (XHR for onUploadProgress) ─────────

export function uploadAudio(
  file: File,
  languageCode: string,
  onProgress: (percent: number) => void
): Promise<{ id: string; status: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/uploads`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));

    const form = new FormData();
    form.append("file", file);
    form.append("language_code", languageCode);
    xhr.send(form);
  });
}

// ── Fetch helpers ───────────────────────────────────────────

export async function fetchUploads(): Promise<Upload[]> {
  const res = await fetch(`${API_BASE}/uploads`);
  if (!res.ok) throw new Error("Failed to fetch uploads");
  return res.json();
}

export async function fetchUploadById(id: string): Promise<Upload | null> {
  const res = await fetch(`${API_BASE}/uploads/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch upload");
  return res.json();
}

// ── Polling endpoint — called every 2s while processing ────

export async function pollChunks(id: string, afterIdx: number): Promise<ChunksPollingResponse> {
  const res = await fetch(`${API_BASE}/uploads/${id}/chunks?after=${afterIdx}`);
  if (!res.ok) throw new Error(`Poll failed: ${res.statusText}`);
  return res.json();
}

// ── Retry summary generation ────────────────────────────────

export async function retrySummary(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/uploads/${id}/summarize`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Summary regeneration failed");
  }
}
