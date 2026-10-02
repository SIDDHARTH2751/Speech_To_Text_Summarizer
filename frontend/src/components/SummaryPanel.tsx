"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { retrySummary } from "@/lib/api";

interface SummaryPanelProps {
  rollingSummary: string | null;
  finalSummary: string | null;
  summaryError: string | null;
  uploadId: string | null;
  isTranscribing?: boolean;
  isSummarizing?: boolean;
}

/**
 * Summary panel that shows:
 * - Rolling summary with "Updating..." badge while transcribing
 * - Final polished summary when done
 * - "Regenerate Summary" button if summary generation failed
 */
export default function SummaryPanel({
  rollingSummary,
  finalSummary,
  summaryError,
  uploadId,
  isTranscribing,
  isSummarizing,
}: SummaryPanelProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const handleRetry = async () => {
    if (!uploadId) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await retrySummary(uploadId);
      // Page will pick up the new summary on the next poll
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  const displaySummary = finalSummary || rollingSummary;
  const isActive = isTranscribing || isSummarizing;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-2 flex items-center justify-between bg-gray-50/50 rounded-t-lg">
        <h3 className="text-sm font-semibold text-gray-700">AI Summary</h3>
        {isActive && !finalSummary && (
          <span className="flex items-center text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full animate-pulse">
            <span className="w-2 h-2 rounded-full bg-indigo-500 mr-1.5" />
            {isSummarizing ? "Finalizing…" : "Updating…"}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 min-h-[160px] max-h-[400px] overflow-y-auto">
        {/* Summary error + regenerate button */}
        {summaryError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-700 mb-2">{summaryError}</p>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
            >
              {retrying ? "Regenerating…" : "Regenerate Summary"}
            </button>
            {retryError && <p className="text-xs text-red-600 mt-1">{retryError}</p>}
          </div>
        )}

        {/* Active loading state */}
        {isActive && !displaySummary && !summaryError ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-indigo-600 font-medium text-sm">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="animate-pulse">Building summary…</span>
            </div>
            <div className="space-y-2 animate-pulse opacity-50">
              <div className="h-3 w-full rounded bg-gray-200" />
              <div className="h-3 w-4/5 rounded bg-gray-200" />
              <div className="h-3 w-3/5 rounded bg-gray-200" />
            </div>
          </div>
        ) : displaySummary ? (
          <div>
            {/* Show "Rolling" label if we only have the rolling summary, not final */}
            {!finalSummary && rollingSummary && (
              <p className="text-xs text-indigo-500 font-medium mb-2 uppercase tracking-wider">
                Live Rolling Summary
              </p>
            )}
            <div className="text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none prose-indigo">
              <ReactMarkdown>{displaySummary}</ReactMarkdown>
              {isActive && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-indigo-500 animate-pulse align-middle" />
              )}
            </div>
          </div>
        ) : !summaryError ? (
          <p className="text-sm text-gray-400 italic">No summary yet.</p>
        ) : null}
      </div>
    </div>
  );
}
