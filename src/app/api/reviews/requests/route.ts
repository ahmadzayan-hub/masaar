// POST /api/reviews/requests — record that a review request was sent manually.
// Body: { order_id, channel: 'whatsapp'|'instagram'|'other', note? }
// Nothing is sent from here. One request per order: a second call is 409.
// Demo mode (no Supabase env): validates and reports, persists nothing.
import { NextRequest, NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { parseReviewRequest, reviewRequest } from "@/lib/operator-productivity";

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = parseReviewRequest(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;

  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: true, demo: true, ...input });
  }

  const role = await getCurrentRole();
  if (role !== "owner" && role !== "operator") {
    return NextResponse.json({ error: `role '${role}' may not record review requests` }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_status")
    .eq("id", input.order_id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (!reviewRequest(order)) {
    return NextResponse.json({ error: "review requests are only recorded for delivered orders" }, { status: 422 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("review_requests")
    .insert({
      order_id: input.order_id,
      channel: input.channel,
      note: input.note ?? null,
      requested_by: user?.id ?? null,
    })
    .select("id, order_id, channel, requested_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "a review request was already recorded for this order" }, { status: 409 });
    }
    const denied = /policy|permission|denied/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: denied ? 403 : 422 });
  }
  return NextResponse.json({ ok: true, request: data });
}
