// Service-role Supabase client for server-side privileged writes (webhooks).
// Bypasses RLS — never import from client components. Returns null when the
// service-role env is absent, so callers can fall back gracefully.
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function hasAdminEnv(): boolean {
  return getAdminClient() !== null;
}
