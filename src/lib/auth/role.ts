// Resolve the caller's app role for RBAC decisions in server code.
// The database policies are the real enforcement; this is for UX gating
// and for demo mode, where there is no Supabase session.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/orders/lifecycle";

export async function getCurrentRole(): Promise<AppRole> {
  if (!hasSupabaseEnv()) return "owner"; // demo mode — full local walkthrough

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "readonly";

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = data?.role as AppRole | undefined;
  return role && ["owner", "operator", "finance", "workshop", "readonly"].includes(role)
    ? role
    : "readonly";
}
