"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { fetchUploadById, pollChunks } from "@/lib/api";
import JobStepper from "@/components/JobStepper";
import TranscriptPanel from "@/components/TranscriptPanel";
import SummaryPanel from "@/components/SummaryPanel";
import ErrorBanner from "@/components/ErrorBanner";
import { Upload, TranscriptChunk, JobStatus } from "@/types";
import Link from "next/link";

/**
 * Detail page for a single upload.
 * - If already done/completed_with_errors: renders stored data instantly, no polling.
 * - If still processing: starts polling every 2s for new chunks.
 */
export default function UploadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [upload, setUpload] = useState<Upload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live polling state (only used if upload is still processing)
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [rollingSummary, setRollingSummary] = useState<string | null>(null);
  const [finalSummary, setFinalSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<JobStatus | null>(null);
  const [chunksDone, setChunksDone] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);
  const lastIdxRef = useRef(-1);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUploadById(id);
      if (!data) {
        setError("Upload not found.");
        return;
      }
      setUpload(data);

      // If already completed, populate state from stored data immediately
      const terminal = ["done", "completed_with_errors", "failed"];
      if (terminal.includes(data.status)) {
        setLiveStatus(data.status as JobStatus);
        setChunks(data.transcript_chunks || []);
        setChunksDone(data.chunks_done);
        setChunksTotal(data.chunks_total);
        setRollingSummary(data.summary?.rolling_summary || null);
        setFinalSummary(data.summary?.final_summary || null);
        setSummaryError(data.summary_error || null);
        // No polling needed
      } else {
        // Still processing — seed with any existing chunks and start polling
        setLiveStatus(data.status as JobStatus);
        setChunks(data.transcript_chunks || []);
        setChunksDone(data.chunks_done);
        setChunksTotal(data.chunks_total);
        if (data.transcript_chunks?.length) {
          lastIdxRef.current = Math.max(...data.transcript_chunks.map((c) => c.idx));
        }
        startPolling();
      }
    } catch {
      setError("Failed to load upload details.");
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const data = await pollChunks(id, lastIdxRef.current);
        setLiveStatus(data.status as JobStatus);
        setChunksDone(data.chunks_done);
        setChunksTotal(data.chunks_total);

        if (data.chunks.length > 0) {
          setChunks((prev) => {
            const existing = new Set(prev.map((c) => c.idx));
            const newOnes = data.chunks.filter((c) => !existing.has(c.idx));
            if (!newOnes.length) return prev;
            const merged = [...prev, ...newOnes].sort((a, b) => a.idx - b.idx);
            lastIdxRef.current = merged[merged.length - 1].idx;
            return merged;
          });
        }

        if (data.rolling_summary) setRollingSummary(data.rolling_summary);
        if (data.final_summary) setFinalSummary(data.final_summary);
        if (data.summary_error) setSummaryError(data.summary_error);

        if (["done", "completed_with_errors", "failed"].includes(data.status)) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Keep retrying silently
      }
    }, 2000);
  };

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-48 rounded bg-gray-200" />
        <div className="h-10 rounded bg-gray-200" />
        <div className="h-40 rounded bg-gray-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} onRetry={load} />
        <Link href="/uploads" className="text-sm text-indigo-600 hover:underline">← Back to uploads</Link>
      </div>
    );
  }

  if (!upload) return null;

  const date = new Date(upload.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const status = liveStatus || (upload.status as JobStatus);
  const isTranscribing = status === "transcribing";
  const isSummarizing = status === "summarizing";
  const progressPercent = chunksTotal > 0 ? Math.round((chunksDone / chunksTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link href="/uploads" className="text-sm text-indigo-600 hover:underline">← Back to uploads</Link>

      <div>
        <h1 className="text-2xl font-bold">{upload.filename}</h1>
        <p className="text-sm text-gray-500">
          {upload.duration_sec ? `${upload.duration_sec.toFixed(1)}s` : "Processing…"} • {upload.language_code} • {date}
        </p>
      </div>

      <JobStepper status={status} />

      {upload.error_message && <ErrorBanner message={upload.error_message} />}

      {/* Progress bar while active */}
      {(isTranscribing || isSummarizing) && chunksTotal > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Transcribing…</span>
            <span>{chunksDone} / {chunksTotal} ({progressPercent}%)</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {status === "completed_with_errors" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Some sections could not be transcribed.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <TranscriptPanel chunks={chunks} isTranscribing={isTranscribing} />
        <SummaryPanel
          rollingSummary={rollingSummary}
          finalSummary={finalSummary}
          summaryError={summaryError}
          uploadId={upload.id}
          isTranscribing={isTranscribing}
          isSummarizing={isSummarizing}
        />
      </div>
    </div>
  );
}
