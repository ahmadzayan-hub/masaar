// Auth gate for the operator console (closes the P1 open-gate finding in
// docs/PROJECT_AUDIT_BASELINE.md: service-role reads bypass RLS, so the
// perimeter must be authenticated).
//
// Rules:
// - Demo mode: when Supabase env is not configured, everything stays open —
//   the console renders the in-memory demo dataset and there is nothing real
//   to protect.
// - Public even when configured: /login and the external webhooks
//   (/api/webhook/whatsapp, /api/webhook/form-intake — Meta/Google call these;
//   they carry their own verification).
// - Automation escape hatch: API calls carrying a valid x-webhook-secret pass
//   (reminder automation hits /api/confirmations/[token] with the shared
//   secret, not a browser session).
// - Everything else requires a Supabase session: pages redirect to /login,
//   API routes get 401 JSON.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next(); // demo mode — Supabase not configured
  }

  const { pathname } = req.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/api/webhook/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && req.headers.get("x-webhook-secret") === secret) {
      return NextResponse.next();
    }
  }

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
      ) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return res;
}

export const config = {
  // Everything except Next internals and static assets. /login and the
  // external webhooks are allow-listed inside the handler so the session
  // cookie still gets refreshed on every other route.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|js|css|map)$).*)",
  ],
};
