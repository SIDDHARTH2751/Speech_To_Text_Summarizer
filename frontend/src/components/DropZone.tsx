"use client";

import { useCallback, useRef, useState } from "react";
import { ACCEPTED_AUDIO_TYPES, ACCEPTED_EXTENSIONS, MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from "@/lib/constants";

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

/**
 * Drag-and-drop zone + click-to-browse.
 * Validates file type and size before calling onFileSelected.
 */
export default function DropZone({ onFileSelected, disabled }: DropZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((file: File): string | null => {
    if (!ACCEPTED_AUDIO_TYPES.includes(file.type as typeof ACCEPTED_AUDIO_TYPES[number])) {
      return `Unsupported file type: ${file.type || "unknown"}. Accepted: ${ACCEPTED_EXTENSIONS}`;
    }
    if (file.size === 0) {
      return "File is empty.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_FILE_SIZE_LABEL}.`;
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      const error = validate(file);
      setValidationError(error);
      if (!error) onFileSelected(file);
    },
    [validate, onFileSelected]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          relative rounded-xl border-2 border-dashed p-10 text-center
          transition-colors cursor-pointer
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${dragActive
            ? "border-indigo-500 bg-indigo-50"
            : "border-gray-300 bg-white hover:border-indigo-400 hover:bg-gray-50"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          onChange={onInputChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="space-y-2">
          <p className="text-4xl">📤</p>
          <p className="text-sm font-medium text-gray-700">
            Drag & drop an audio file here, or{" "}
            <span className="text-indigo-600 underline">browse</span>
          </p>
          <p className="text-xs text-gray-400">
            {ACCEPTED_EXTENSIONS} • Max {MAX_FILE_SIZE_LABEL}
          </p>
        </div>
      </div>

      {validationError && (
        <p className="mt-2 text-sm text-red-600">{validationError}</p>
      )}
    </div>
  );
}
