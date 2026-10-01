import { JobStatus } from "@/types";

interface JobStepperProps {
  status: JobStatus;
}

const STEPS: { key: JobStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "transcribing", label: "Transcribing" },
  { key: "summarizing", label: "Summarizing" },
  { key: "done", label: "Done" },
];

/**
 * Horizontal stepper that highlights the current job state.
 * Shows a red "Failed" badge if status === "failed".
 */
export default function JobStepper({ status }: JobStepperProps) {
  if (status === "failed") {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center">
        <span className="text-red-600 font-semibold">✖ Processing Failed</span>
      </div>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center justify-between gap-2">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
            {/* Circle */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isCompleted
                  ? "bg-indigo-600 text-white"
                  : isCurrent
                  ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {isCompleted ? "✓" : idx + 1}
            </div>
            {/* Label */}
            <span
              className={`text-xs font-medium ${
                isCurrent ? "text-indigo-700" : isCompleted ? "text-indigo-600" : "text-gray-400"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
