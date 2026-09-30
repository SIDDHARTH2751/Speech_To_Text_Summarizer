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

  const sizeMB = (upload.fileSize / (1024 * 1024)).toFixed(2);
  const date = new Date(upload.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <Link href="/uploads" className="text-sm text-indigo-600 hover:underline">
        ← Back to uploads
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{upload.fileName}</h1>
        <p className="text-sm text-gray-500">
          {sizeMB} MB • {date}
        </p>
      </div>

      {/* Status stepper */}
      <JobStepper status={upload.status} />

      {/* Error from the job itself */}
      {upload.errorMessage && (
        <ErrorBanner message={upload.errorMessage} />
      )}

      {/* Transcript + Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <TranscriptPanel transcript={upload.transcript} />
        <SummaryPanel summary={upload.summary} />
      </div>
    </div>
  );
}
