/**
 * Architecture page — explains the system design for the interviewer.
 */
export default function ArchitecturePage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Architecture</h1>

      {/* Upload → Transcript Flow */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Upload → Transcript Flow</h2>
        <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 pl-2">
          <li><strong>Upload:</strong> User drops an audio file → <code>POST /api/uploads</code> saves it to local storage, creates a DB row with <code>status=queued</code>, and returns the upload ID immediately.</li>
          <li><strong>Background job:</strong> An <code>asyncio.create_task</code> picks up the upload. It validates with ffprobe, then converts and splits into ~8s mono 16kHz WAV chunks using ffmpeg&apos;s segment muxer.</li>
          <li><strong>Concurrent transcription:</strong> Up to 3 chunks are transcribed in parallel via <code>asyncio.Semaphore(3)</code>. Each chunk is sent to the Gnani REST API. Results are saved to DB per-chunk as they complete.</li>
          <li><strong>Rolling summary:</strong> Every 4 chunks (~32s of audio), the new transcript text is merged into a rolling summary via Groq&apos;s LLM API. This runs without blocking transcription.</li>
          <li><strong>Final summary:</strong> Once all chunks are done, one final LLM call polishes the rolling summary into a structured final summary with bullet points.</li>
          <li><strong>Frontend polling:</strong> The UI polls <code>GET /api/uploads/{"{id}"}/chunks?after=N</code> every 2 seconds. Each response only includes new chunks (those with idx &gt; N), making polling lightweight.</li>
        </ol>
      </section>

      {/* Chunking */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Audio Chunking</h2>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          <strong>Why chunk?</strong> Gnani REST has a 30s limit, so audio is split into ~8s chunks, transcribed with bounded concurrency, saved per chunk, and surfaced to the UI via polling every 2s. Re-encoding (not stream copy) during splitting guarantees exact chunk durations.
        </div>
      </section>

      {/* Storage */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Where Files Live</h2>
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
          <li><strong>Original audio:</strong> <code>uploads_storage/{"{upload_id}"}/original.mp3</code> (behind a <code>storage.py</code> interface so it can be swapped to S3/R2 later)</li>
          <li><strong>Temp chunks:</strong> <code>uploads_storage/{"{upload_id}"}/original_chunks/chunk_000.wav</code> — deleted after processing</li>
          <li><strong>Database:</strong> PostgreSQL (dev) via async SQLAlchemy. Tables: <code>uploads</code>, <code>transcript_chunks</code>, <code>summaries</code></li>
        </ul>
      </section>

      {/* Background Processing */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Sync vs Background</h2>
        <p className="text-sm text-gray-700">
          The upload request returns immediately. All heavy work (ffmpeg, Gnani API calls, LLM calls) runs in a background <code>asyncio.create_task</code>. This keeps the API responsive and allows the frontend to show progress in real time. For production, this would be replaced with a proper task queue (Celery/ARQ) for reliability and horizontal scaling.
        </p>
      </section>

      {/* Error handling */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Error Handling</h2>
        <p className="text-sm text-gray-700">
          Per-chunk error handling: if a chunk fails after 3 retries, it&apos;s marked <code>failed</code> individually and the rest continue. The upload finishes as <code>completed_with_errors</code> instead of failing entirely. The UI shows inline markers for failed sections. Failed summaries can be retried via a button.
        </p>
      </section>

      {/* What I'd Do Differently */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">What I&apos;d Do Differently in Production</h2>
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
          <li>Use Gnani&apos;s Batch STT API (supports up to 4 hours, returns timestamps) instead of manual chunking</li>
          <li>Add<code>asyncio.create_task</code> with a durable queue (Celery + Redis or ARQ)</li>
          <li>Add WebSocket or SSE for true real-time push instead of polling</li>
          <li>Add user authentication and rate limiting</li>
        </ul>
      </section>

      {/* Tech stack */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Tech Stack</h2>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
          <div><strong>Frontend:</strong> Next.js 15 + TypeScript + Tailwind CSS v3</div>
          <div><strong>Backend:</strong> FastAPI + async SQLAlchemy + PostgreSQL</div>
          <div><strong>STT:</strong> Gnani Vachana REST API</div>
          <div><strong>LLM:</strong> Groq (Qwen 3.8 27B)</div>
          <div><strong>Audio:</strong> ffmpeg/ffprobe</div>
          <div><strong>Updates:</strong> Polling (GET /chunks?after=N)</div>
        </div>
      </section>
    </div>
  );
}
