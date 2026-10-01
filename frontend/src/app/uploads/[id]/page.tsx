"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchUploadById } from "@/lib/api";
import JobStepper from "@/components/JobStepper";
import TranscriptPanel from "@/components/TranscriptPanel";
import SummaryPanel from "@/components/SummaryPanel";
import ErrorBanner from "@/components/ErrorBanner";
import { Upload } from "@/types";
import Link from "next/link";

/** Detail page for a single upload — shows transcript + summary. */
export default function UploadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [upload, setUpload] = useState<Upload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUploadById(id);
      if (!data) {
        setError("Upload not found.");
      } else {
        setUpload(data);
      }
    } catch {
      setError("Failed to load upload details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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
        <Link href="/uploads" className="text-sm text-indigo-600 hover:underline">
          ← Back to uploads
        </Link>
      </div>
    );
  }

  if (!upload) return null;

  const date = new Date(upload.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Build full transcript from chunks
  const fullTranscript = upload.transcript_chunks?.length
    ? upload.transcript_chunks.map((c) => c.text).join(" ")
    : null;

  // Pick the best summary available
  const summaryText = upload.summary?.final_summary || upload.summary?.rolling_summary || null;

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <Link href="/uploads" className="text-sm text-indigo-600 hover:underline">
        ← Back to uploads
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{upload.filename}</h1>
        <p className="text-sm text-gray-500">
          {upload.duration_sec ? `${upload.duration_sec.toFixed(1)}s` : "Unknown duration"} •{" "}
          {upload.language_code} • {date}
        </p>
      </div>

      {/* Status stepper */}
      <JobStepper status={upload.status} />

      {/* Error from the job itself */}
      {upload.error_message && (
        <ErrorBanner message={upload.error_message} />
      )}

      {/* Transcript + Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <TranscriptPanel transcript={fullTranscript} />
        <SummaryPanel summary={summaryText} />
      </div>
    </div>
  );
}
