interface SummaryPanelProps {
  summary: string | null;
  isLoading?: boolean;
}

/** Panel that shows the LLM summary, a skeleton, or an empty state. */
export default function SummaryPanel({ summary, isLoading }: SummaryPanelProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-2">
        <h3 className="text-sm font-semibold text-gray-700">✨ Summary</h3>
      </div>
      <div className="p-4 min-h-[80px]">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 w-full rounded bg-gray-200" />
            <div className="h-3 w-4/5 rounded bg-gray-200" />
            <div className="h-3 w-3/5 rounded bg-gray-200" />
          </div>
        ) : summary ? (
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {summary}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">No summary yet.</p>
        )}
      </div>
    </div>
  );
}
