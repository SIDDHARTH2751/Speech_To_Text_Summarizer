interface TranscriptPanelProps {
  transcript: string | null;
  isLoading?: boolean;
}

/** Panel that shows the transcript text, a skeleton, or an empty state. */
export default function TranscriptPanel({ transcript, isLoading }: TranscriptPanelProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-2">
        <h3 className="text-sm font-semibold text-gray-700">📝 Transcript</h3>
      </div>
      <div className="p-4 min-h-[120px]">
        {isLoading ? (
          // Skeleton lines
          <div className="space-y-2 animate-pulse">
            <div className="h-3 w-full rounded bg-gray-200" />
            <div className="h-3 w-5/6 rounded bg-gray-200" />
            <div className="h-3 w-4/6 rounded bg-gray-200" />
            <div className="h-3 w-full rounded bg-gray-200" />
            <div className="h-3 w-3/4 rounded bg-gray-200" />
          </div>
        ) : transcript ? (
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {transcript}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">No transcript yet.</p>
        )}
      </div>
    </div>
  );
}
