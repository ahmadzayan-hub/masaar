// POST /api/orders/[id]/status — advance an order through the lifecycle.
// Body: { to: OrderStatus, reason?: string }
// Real mode: delegates to the advance_order_status() RPC, which enforces the
// transition table, role permissions, audit trail, and domain-event outbox.
// Demo mode (no Supabase env): validates against the local lifecycle mirror.
import { NextRequest, NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import {
  ORDER_STATUSES,
  type OrderStatus,
  isValidTransition,
  roleMayTransition,
  eventForTransition,
} from "@/lib/orders/lifecycle";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Next 15: route params arrive as a promise.
  const { id } = await params;
  let body: { to?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const to = (body.to ?? "").trim().toLowerCase();
  if (!(ORDER_STATUSES as readonly string[]).includes(to)) {
    return NextResponse.json(
      { error: `unknown status '${body.to}'`, allowed: ORDER_STATUSES },
      { status: 400 }
    );
  }

  if (!hasSupabaseEnv()) {
    // Demo mode: no persistence — report what the transition would do.
    return NextResponse.json({
      ok: true,
      demo: true,
      order_id: id,
      to,
      event: eventForTransition(to as OrderStatus),
    });
  }

  const role = await getCurrentRole();
  const supabase = await createClient();

  // Pre-flight for a clearer error than the raw RPC exception.
  const { data: current } = await supabase
    .from("orders")
    .select("order_status")
    .eq("id", id)
    .maybeSingle();
  if (current?.order_status) {
    const from = current.order_status as OrderStatus;
    if (!isValidTransition(from, to as OrderStatus)) {
      return NextResponse.json({ error: `invalid transition ${from} -> ${to}` }, { status: 422 });
    }
    if (!roleMayTransition(role, from, to as OrderStatus)) {
      return NextResponse.json(
        { error: `role '${role}' may not move an order from ${from} to ${to}` },
        { status: 403 }
      );
    }
  }

  const { data, error } = await supabase.rpc("advance_order_status", {
    p_order_id: id,
    p_to: to,
    p_reason: body.reason ?? null,
    p_actor_type: "human",
  });
  if (error) {
    const denied = /may not|readonly|service role/.test(error.message);
    return NextResponse.json({ error: error.message }, { status: denied ? 403 : 422 });
  }

  return NextResponse.json({ ok: true, order: data, event: eventForTransition(to as OrderStatus) });
}
