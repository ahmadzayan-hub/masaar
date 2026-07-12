"use client";
import Link from "next/link";

export default function Error({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="text-5xl">⚠</div>
      <h1 className="mt-4 text-2xl font-semibold">Something went sideways</h1>
      <p className="muted mt-1">{error.message || "An unexpected error occurred."}</p>
      {error.digest && <p className="mt-2 text-xs text-gray-400">trace: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <button className="btn btn-primary" onClick={reset}>Try again</button>
        <Link href="/" className="btn btn-ghost">Dashboard</Link>
      </div>
    </div>
  );
}
