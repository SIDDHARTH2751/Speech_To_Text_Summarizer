"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import DropZone from "@/components/DropZone";
import FilePreview from "@/components/FilePreview";
import UploadProgress from "@/components/UploadProgress";
import JobStepper from "@/components/JobStepper";
import TranscriptPanel from "@/components/TranscriptPanel";
import SummaryPanel from "@/components/SummaryPanel";
import ErrorBanner from "@/components/ErrorBanner";
import { uploadAudio, subscribeToStream } from "@/lib/api";
import { JobStatus, TranscriptChunk, SUPPORTED_LANGUAGES } from "@/types";

/**
 * Home page — the main upload + processing flow.
 *
 * State machine:
 *   idle → uploading → SSE stream (queued→processing→transcribing→summarizing→done) → complete
 *   Any step can → error
 */
export default function HomePage() {
  // File selection
  const [file, setFile] = useState<File | null>(null);
  const [languageCode, setLanguageCode] = useState("en-IN");

  // Upload & job tracking
  const [uploadPercent, setUploadPercent] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  // Progress from SSE
  const [chunksDone, setChunksDone] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);

  // Results — transcript chunks stream in one by one
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  // Errors
  const [error, setError] = useState<string | null>(null);

  // SSE cleanup ref
  const cleanupRef = useRef<(() => void) | null>(null);

  // ── Upload handler ────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!file) return;

    // Reset state for a fresh upload
    setError(null);
    setTranscriptChunks([]);
    setSummary(null);
    setJobStatus("queued");
    setUploadPercent(0);
    setChunksDone(0);
    setChunksTotal(0);

    try {
      // Phase 1: Upload with progress
      setJobStatus("queued");
      const res = await uploadAudio(file, languageCode, (pct) => setUploadPercent(pct));
      setJobId(res.id);

      // Phase 2: Subscribe to SSE for live updates
      const cleanup = subscribeToStream(res.id, {
        onStatus: (status) => setJobStatus(status),
        onProgress: (done, total) => {
          setChunksDone(done);
          setChunksTotal(total);
        },
        onTranscriptChunk: (chunk) => {
          // Append new chunk — use functional update to avoid stale closure
          setTranscriptChunks((prev) => {
            // Avoid duplicates on reconnect
            if (prev.some((c) => c.idx === chunk.idx)) return prev;
            return [...prev, chunk].sort((a, b) => a.idx - b.idx);
          });
        },
        onSummaryUpdate: (data) => {
          setSummary(data.final_summary || data.rolling_summary);
        },
        onDone: () => {
          setJobStatus("done");
        },
        onError: (msg) => {
          setError(msg);
          setJobStatus("failed");
        },
      });

      cleanupRef.current = cleanup;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setJobStatus("failed");
    }
  }, [file, languageCode]);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  // ── Reset everything ──────────────────────────────────────────
  const handleRetry = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setError(null);
    setJobStatus(null);
    setJobId(null);
    setUploadPercent(0);
    setTranscriptChunks([]);
    setSummary(null);
    setChunksDone(0);
    setChunksTotal(0);
  };

  // ── Derived booleans for cleaner JSX ──────────────────────────
  const isProcessing =
    jobStatus === "queued" ||
    jobStatus === "processing" ||
    jobStatus === "transcribing" ||
    jobStatus === "summarizing";
  const isDone = jobStatus === "done";
  const isBusy = isProcessing;

  // Build full transcript text from chunks
  const fullTranscript = transcriptChunks.map((c) => c.text).join(" ") || null;

  // Progress percentage from chunk counts
  const progressPercent =
    chunksTotal > 0 ? Math.round((chunksDone / chunksTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Audio</h1>
        <p className="text-sm text-gray-500 mt-1">
          Drop an audio file to get a transcript and AI summary.
        </p>
      </div>

      {/* Error banner */}
      {error && <ErrorBanner message={error} onRetry={handleRetry} />}

      {/* Drop zone + language picker — hidden once processing starts */}
      {!jobStatus && (
        <>
          <DropZone onFileSelected={setFile} disabled={isBusy} />

          {file && <FilePreview file={file} onRemove={() => setFile(null)} />}

          {file && (
            <div className="space-y-3">
              {/* Language picker */}
              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                  Audio Language
                </label>
                <select
                  id="language"
                  value={languageCode}
                  onChange={(e) => setLanguageCode(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleUpload}
                disabled={isBusy}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Upload & Process
              </button>
            </div>
          )}
        </>
      )}

      {/* Upload progress bar (during file upload to server) */}
      {jobStatus && uploadPercent < 100 && (
        <UploadProgress percent={uploadPercent} />
      )}

      {/* Job stepper (once upload is done and processing begins) */}
      {jobStatus && uploadPercent >= 100 && (
        <JobStepper status={jobStatus} />
      )}

      {/* Chunk progress (while transcribing) */}
      {isProcessing && chunksTotal > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Transcribing chunks…</span>
            <span>
              {chunksDone} / {chunksTotal} ({progressPercent}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Transcript + Summary panels */}
      {(isProcessing || isDone) && (
        <div className="grid gap-4 md:grid-cols-2">
          <TranscriptPanel
            transcript={fullTranscript}
            isLoading={jobStatus === "processing" || jobStatus === "queued"}
          />
          <SummaryPanel
            summary={summary}
            isLoading={jobStatus === "summarizing"}
          />
        </div>
      )}

      {/* New upload button after completion */}
      {(isDone || jobStatus === "failed") && (
        <button
          onClick={handleRetry}
          className="w-full rounded-lg border border-indigo-300 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
        >
          Upload Another File
        </button>
      )}
    </div>
  );
}
