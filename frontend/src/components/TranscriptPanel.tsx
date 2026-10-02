"use client";
import { useEffect, useRef } from "react";
import { TranscriptChunk } from "@/types";

interface TranscriptPanelProps {
  chunks: TranscriptChunk[];
  isTranscribing?: boolean;
}

/**
 * Transcript panel that renders chunks in order with:
 * - Failed chunks shown as inline warning markers
 * - New text appears with a fade-in transition (typewriter feel)
 * - Blinking cursor at the end while transcribing
 * - Auto-scrolls to the bottom as new text arrives
 */
export default function TranscriptPanel({ chunks, isTranscribing }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new chunks arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks.length]);

  const hasContent = chunks.some((c) => c.status === "done" || c.status === "failed");

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-2 flex items-center justify-between bg-gray-50/50 rounded-t-lg">
        <h3 className="text-sm font-semibold text-gray-700">Transcript</h3>
        {isTranscribing && (
          <span className="flex items-center text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full animate-pulse">
            <span className="w-2 h-2 rounded-full bg-indigo-500 mr-1.5" />
            Live
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 min-h-[160px] max-h-[400px] overflow-y-auto">
        {!hasContent && isTranscribing ? (
          /* Waiting for first chunk */
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-indigo-600 font-medium text-sm">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="animate-pulse">Listening to audio…</span>
            </div>
            <div className="space-y-2 animate-pulse opacity-50">
              <div className="h-3 w-full rounded bg-gray-200" />
              <div className="h-3 w-5/6 rounded bg-gray-200" />
              <div className="h-3 w-4/6 rounded bg-gray-200" />
            </div>
          </div>
        ) : !hasContent ? (
          <p className="text-sm text-gray-400 italic">No transcript available.</p>
        ) : (
          /* Render chunks in order */
          <div className="text-sm text-gray-800 leading-relaxed space-y-0">
            {chunks.map((chunk) => {
              if (chunk.status === "failed") {
                return (
                  <span
                    key={chunk.idx}
                    className="inline-block bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded border border-amber-200 mx-1 my-0.5"
                    title={chunk.error || "Transcription failed for this section"}
                  >
                    ⚠️ [Could not transcribe {chunk.start_sec.toFixed(0)}s–{chunk.end_sec.toFixed(0)}s]
                  </span>
                );
              }
              if (chunk.status === "done" && chunk.text) {
                return (
                  <span key={chunk.idx} className="animate-fadeIn">
                    {chunk.text}{" "}
                  </span>
                );
              }
              return null; // pending chunks not shown
            })}
            {/* Blinking cursor while transcribing */}
            {isTranscribing && (
              <span className="inline-block w-1.5 h-4 bg-indigo-500 animate-pulse align-middle ml-0.5" />
            )}
            {/* Scroll anchor */}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
