"use client";
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setMsg(null);
    setLoading(true);
    try {
      // Dynamic-import so the Supabase JS bundle isn't pulled in on first paint
      // and so the demo build works even when the client can't be created.
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      else window.location.href = "/";
    } catch {
      setMsg("Supabase is not configured. Use 'Enter as demo owner' to explore.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-md md:mt-20">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Beyond Style UAE</h1>
        <p className="muted">Order Control Console — owner / operator sign in.</p>
      </div>

      <div className="card flex flex-col gap-3">
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@beyondstyle.ae"
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={signIn} disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {msg && <p className="text-sm text-red-700">{msg}</p>}

        <div className="flex items-center gap-2 py-1 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          <span>or</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <Link href="/" className="btn btn-accent justify-center">
          Enter as demo owner
        </Link>
        <p className="text-center text-xs text-gray-500">
          Demo mode uses seeded data — no Supabase required. Connect a real Supabase
          project to enable production sign-in.
        </p>
      </div>
    </div>
  );
}
