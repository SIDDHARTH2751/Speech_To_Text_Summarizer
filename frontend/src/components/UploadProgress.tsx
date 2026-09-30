interface UploadProgressProps {
  percent: number;
}

/** Horizontal progress bar showing upload percentage. */
export default function UploadProgress({ percent }: UploadProgressProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>Uploading…</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
