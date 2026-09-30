interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

/** Red error banner with optional Retry button. */
export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span className="text-red-500 text-lg">⚠️</span>
        <p className="text-sm text-red-700">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  );
}
