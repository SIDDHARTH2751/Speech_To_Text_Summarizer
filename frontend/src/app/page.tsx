"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import DropZone from "@/components/DropZone";
import FilePreview from "@/components/FilePreview";
import UploadProgress from "@/components/UploadProgress";
import JobStepper from "@/components/JobStepper";
import TranscriptPanel from "@/components/TranscriptPanel";
import SummaryPanel from "@/components/SummaryPanel";
import ErrorBanner from "@/components/ErrorBanner";
import { uploadAudio, pollJobStatus } from "@/lib/api";
import { JobStatus } from "@/types";

/**
 * Home page — the main upload + processing flow.
 *
 * State machine:
 *   idle → uploading → polling (queued→transcribing→summarizing→done) → complete
 *   Any step can → error
 */
export default function HomePage() {
  // File selection
  const [file, setFile] = useState<File | null>(null);

  // Upload & job tracking
  const [uploadPercent, setUploadPercent] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  // Results
  const [transcript, setTranscript] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  // Errors
  const [error, setError] = useState<string | null>(null);

  // Ref to stop polling on unmount
  const pollingRef = useRef(false);

  // ── Upload handler ────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!file) return;

    // Reset state for a fresh upload
    setError(null);
    setTranscript(null);
    setSummary(null);
    setJobStatus("uploading");
    setUploadPercent(0);

    try {
      const res = await uploadAudio(file, (pct) => setUploadPercent(pct));
      setJobId(res.id);
      setJobStatus(res.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setJobStatus("failed");
    }
  }, [file]);

  // ── Poll for job progress once we have a jobId ────────────────
  useEffect(() => {
    if (!jobId || jobStatus === "done" || jobStatus === "failed") return;

    pollingRef.current = true;

    const poll = async () => {
      while (pollingRef.current) {
        try {
          const job = await pollJobStatus(jobId);
          setJobStatus(job.status);

          if (job.transcript) setTranscript(job.transcript);
          if (job.summary) setSummary(job.summary);

          if (job.status === "done" || job.status === "failed") {
            if (job.errorMessage) setError(job.errorMessage);
            break;
          }
        } catch {
          setError("Lost connection while checking progress. Please retry.");
          setJobStatus("failed");
          break;
        }

        // Poll every 1.5 seconds
        await new Promise((r) => setTimeout(r, 1500));
      }
    };

    poll();

    return () => {
      pollingRef.current = false;
    };
  }, [jobId, jobStatus]);

  // ── Reset everything ──────────────────────────────────────────
  const handleRetry = () => {
    setError(null);
    setJobStatus(null);
    setJobId(null);
    setUploadPercent(0);
    setTranscript(null);
    setSummary(null);
  };

  // ── Derived booleans for cleaner JSX ──────────────────────────
  const isUploading = jobStatus === "uploading";
  const isProcessing =
    jobStatus === "queued" ||
    jobStatus === "transcribing" ||
    jobStatus === "summarizing";
  const isDone = jobStatus === "done";
  const isBusy = isUploading || isProcessing;

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

      {/* Drop zone — hidden once processing starts */}
      {!jobStatus && (
        <>
          <DropZone onFileSelected={setFile} disabled={isBusy} />
          {file && <FilePreview file={file} onRemove={() => setFile(null)} />}
          {file && (
            <button
              onClick={handleUpload}
              disabled={isBusy}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Upload & Process
            </button>
          )}
        </>
      )}

      {/* Upload progress */}
      {isUploading && <UploadProgress percent={uploadPercent} />}

      {/* Job stepper */}
      {jobStatus && jobStatus !== "uploading" && (
        <JobStepper status={jobStatus} />
      )}

      {/* Transcript + Summary panels */}
      {(isProcessing || isDone) && (
        <div className="grid gap-4 md:grid-cols-2">
          <TranscriptPanel
            transcript={transcript}
            isLoading={jobStatus === "transcribing" || jobStatus === "queued"}
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
