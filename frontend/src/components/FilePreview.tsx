interface FilePreviewProps {
  file: File;
  onRemove: () => void;
}

/** Shows selected file name + size, with a remove button. */
export default function FilePreview({ file, onRemove }: FilePreviewProps) {
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-2xl">🎵</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {file.name}
          </p>
          <p className="text-xs text-gray-500">{sizeMB} MB</p>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-gray-400 hover:text-red-500 transition-colors text-lg cursor-pointer"
        aria-label="Remove file"
      >
        ✕
      </button>
    </div>
  );
}
