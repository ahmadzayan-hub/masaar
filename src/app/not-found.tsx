import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="text-5xl">🤍</div>
      <h1 className="mt-4 text-2xl font-semibold">Nothing here yet</h1>
      <p className="muted mt-1">The page you&apos;re looking for doesn&apos;t exist or moved.</p>
      <Link href="/" className="btn btn-primary mt-6 inline-flex">Back to dashboard</Link>
    </div>
  );
}
