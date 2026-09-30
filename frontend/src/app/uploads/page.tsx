"use client";

import { useEffect, useState } from "react";
import { fetchUploads } from "@/lib/api";
import UploadCard from "@/components/UploadCard";
import ErrorBanner from "@/components/ErrorBanner";
import { Upload } from "@/types";

/** Lists all past uploads. Each card links to /uploads/[id]. */
export default function UploadsPage() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUploads();
      setUploads(data);
    } catch {
      setError("Failed to load uploads.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Past Uploads</h1>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        // Skeleton cards
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-200" />
          ))}
        </div>
      ) : uploads.length === 0 ? (
        <p className="text-sm text-gray-500">No uploads yet. Go upload something!</p>
      ) : (
        <div className="space-y-3">
          {uploads.map((u) => (
            <UploadCard key={u.id} upload={u} />
          ))}
        </div>
      )}
    </div>
  );
}
