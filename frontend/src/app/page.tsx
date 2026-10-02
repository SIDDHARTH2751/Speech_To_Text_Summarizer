"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import DropZone from "@/components/DropZone";
import FilePreview from "@/components/FilePreview";
import UploadProgress from "@/components/UploadProgress";
import JobStepper from "@/components/JobStepper";
import TranscriptPanel from "@/components/TranscriptPanel";
import SummaryPanel from "@/components/SummaryPanel";
import ErrorBanner from "@/components/ErrorBanner";
import { uploadAudio, pollChunks } from "@/lib/api";
import { JobStatus, TranscriptChunk, SUPPORTED_LANGUAGES } from "@/types";

/**
 * Home page — the main upload + processing flow.
 *
 * After upload completes, polls GET /uploads/{id}/chunks?after=N every 2 seconds.
 * New chunks are appended to state in idx order.
 * Polling stops when status is done/completed_with_errors/failed.
 */
export default function HomePage() {
  // File selection
  const [file, setFile] = useState<File | null>(null);
  const [languageCode, setLanguageCode] = useState("en-IN");

  // Upload & job tracking
  const [uploadPercent, setUploadPercent] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  // Progress
  const [chunksDone, setChunksDone] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);

  // Transcript chunks (accumulated from polling)
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const lastIdxRef = useRef(-1); // highest idx we've received so far

  // Summary
  const [rollingSummary, setRollingSummary] = useState<string | null>(null);
  const [finalSummary, setFinalSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Errors & reconnection
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  // Polling interval ref for cleanup
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Start polling ─────────────────────────────────────────
  const startPolling = useCallback((uploadId: string) => {
    // Clear any existing interval
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const data = await pollChunks(uploadId, lastIdxRef.current);
        setReconnecting(false);

        // Update status and progress
        setJobStatus(data.status as JobStatus);
        setChunksDone(data.chunks_done);
        setChunksTotal(data.chunks_total);

        // Append new chunks (dedup by idx)
        if (data.chunks.length > 0) {
          setTranscriptChunks((prev) => {
            const existing = new Set(prev.map((c) => c.idx));
            const newChunks = data.chunks.filter((c) => !existing.has(c.idx));
            if (newChunks.length === 0) return prev;
            const merged = [...prev, ...newChunks].sort((a, b) => a.idx - b.idx);
            // Update lastIdx watermark
            lastIdxRef.current = merged[merged.length - 1].idx;
            return merged;
          });
        }

        // Update summary
        if (data.rolling_summary) setRollingSummary(data.rolling_summary);
        if (data.final_summary) setFinalSummary(data.final_summary);
        if (data.summary_error) setSummaryError(data.summary_error);
        if (data.error_message) setError(data.error_message);

        // Stop polling on terminal status
        if (["done", "completed_with_errors", "failed"].includes(data.status)) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Poll failed — show reconnecting note, keep trying
        setReconnecting(true);
      }
    }, 2000);
  }, []);

  // ── Upload handler ────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!file) return;

    // Reset
    setError(null);
    setTranscriptChunks([]);
    setRollingSummary(null);
    setFinalSummary(null);
    setSummaryError(null);
    setJobStatus("queued");
    setUploadPercent(0);
    setChunksDone(0);
    setChunksTotal(0);
    lastIdxRef.current = -1;

    try {
      const res = await uploadAudio(file, languageCode, (pct) => setUploadPercent(pct));
      setJobId(res.id);
      startPolling(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setJobStatus("failed");
    }
  }, [file, languageCode, startPolling]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Reset ─────────────────────────────────────────────────
  const handleRetry = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setError(null);
    setJobStatus(null);
    setJobId(null);
    setUploadPercent(0);
    setTranscriptChunks([]);
    setRollingSummary(null);
    setFinalSummary(null);
    setSummaryError(null);
    setChunksDone(0);
    setChunksTotal(0);
    lastIdxRef.current = -1;
  };

  // ── Derived state ─────────────────────────────────────────
  const isProcessing = ["queued", "processing", "transcribing", "summarizing"].includes(jobStatus || "");
  const isDone = jobStatus === "done" || jobStatus === "completed_with_errors";
  const progressPercent = chunksTotal > 0 ? Math.round((chunksDone / chunksTotal) * 100) : 0;

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

      {/* Reconnecting note */}
      {reconnecting && (
        <div className="flex items-center space-x-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Reconnecting to server…</span>
        </div>
      )}

      {/* Drop zone + language picker — hidden once processing starts */}
      {!jobStatus && (
        <>
          <DropZone onFileSelected={setFile} disabled={false} />
          {file && <FilePreview file={file} onRemove={() => setFile(null)} />}
          {file && (
            <div className="space-y-3">
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
                    <option key={lang.code} value={lang.code}>{lang.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleUpload}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Upload &amp; Process
              </button>
            </div>
          )}
        </>
      )}

      {/* Upload progress */}
      {jobStatus && uploadPercent < 100 && <UploadProgress percent={uploadPercent} />}

      {/* Job stepper */}
      {jobStatus && uploadPercent >= 100 && <JobStepper status={jobStatus} />}

      {/* Chunk progress bar */}
      {isProcessing && chunksTotal > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Transcribing chunks…</span>
            <span>{chunksDone} / {chunksTotal} ({progressPercent}%)</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Transcript + Summary panels */}
      {(isProcessing || isDone) && (
        <div className="grid gap-4 md:grid-cols-2">
          <TranscriptPanel
            chunks={transcriptChunks}
            isTranscribing={jobStatus === "transcribing"}
          />
          <SummaryPanel
            rollingSummary={rollingSummary}
            finalSummary={finalSummary}
            summaryError={summaryError}
            uploadId={jobId}
            isTranscribing={jobStatus === "transcribing"}
            isSummarizing={jobStatus === "summarizing"}
          />
        </div>
      )}

      {/* Completed with errors banner */}
      {jobStatus === "completed_with_errors" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Some audio sections could not be transcribed. The available transcript and summary are shown above.
        </div>
      )}

      {/* Upload another file */}
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
