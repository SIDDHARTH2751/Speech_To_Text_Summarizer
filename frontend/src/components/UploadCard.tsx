import Link from "next/link";
import { Upload } from "@/types";

interface UploadCardProps {
  upload: Upload;
}

/** A single row in the past-uploads list. Clickable to view details. */
export default function UploadCard({ upload }: UploadCardProps) {
  const date = new Date(upload.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusColor: Record<string, string> = {
    done: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    processing: "bg-blue-100 text-blue-700",
    queued: "bg-yellow-100 text-yellow-700",
    transcribing: "bg-purple-100 text-purple-700",
    summarizing: "bg-indigo-100 text-indigo-700",
  };

  return (
    <Link
      href={`/uploads/${upload.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {upload.filename}
          </p>
          <p className="text-xs text-gray-500">
            {upload.duration_sec ? `${upload.duration_sec.toFixed(1)}s` : "Processing..."} •{" "}
            {upload.language_code} • {date}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            statusColor[upload.status] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {upload.status}
        </span>
      </div>
    </Link>
  );
}
