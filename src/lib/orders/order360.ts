// Order 360 read model: one order + everything around it (customer, payments,
// delivery, transition history). Demo mode synthesizes a plausible timeline
// from the canonical happy path so the screen is fully explorable offline.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getDemoTable } from "@/lib/demo/seed";
import {
  ORDER_STATUSES,
  normalizeStatus,
  type OrderStatus,
} from "./lifecycle";

export interface OrderEvent {
  id: string;
  from_status: string;
  to_status: string;
  actor_type: string;
  actor_role: string | null;
  reason: string | null;
  created_at: string;
}

export interface Order360 {
  order: Record<string, unknown> | null;
  customer: Record<string, unknown> | null;
  payments: Record<string, unknown>[];
  delivery: Record<string, unknown> | null;
  events: OrderEvent[];
  status: OrderStatus;
  demoMode: boolean;
}

const HAPPY_PATH: OrderStatus[] = [
  "lead", "qualified", "confirmed", "paid", "design_approval",
  "production", "qc", "dispatched", "delivered", "after_sales",
];

/** Demo timeline: the steps the order has already passed on the happy path. */
export function synthesizeEvents(order: Record<string, unknown>): OrderEvent[] {
  const status = normalizeStatus(order.order_status as string);
  const createdAt = new Date((order.created_at as string) ?? Date.now()).getTime();
  const target = status === "cancelled" ? "cancelled" : status;
  const idx = HAPPY_PATH.indexOf(target as OrderStatus);
  const steps: Array<{ from: OrderStatus; to: OrderStatus }> = [];
  if (idx > 0) {
    for (let i = 1; i <= idx; i++) {
      steps.push({ from: HAPPY_PATH[i - 1], to: HAPPY_PATH[i] });
    }
  } else if (target === "cancelled") {
    steps.push({ from: "lead", to: "cancelled" });
  }
  const spacing = 6 * 3_600_000; // 6h between demo transitions
  return steps.map((s, i) => ({
    id: `demo-ev-${i}`,
    from_status: s.from,
    to_status: s.to,
    actor_type: s.to === "confirmed" ? "system" : "human",
    actor_role: s.to === "paid" ? "finance" : s.to === "qc" || s.to === "production" ? "workshop" : "operator",
    reason: null,
    created_at: new Date(createdAt + (i + 1) * spacing).toISOString(),
  }));
}

export async function fetchOrder360(id: string): Promise<Order360> {
  if (!hasSupabaseEnv()) {
    const orders = getDemoTable("orders");
    const order = orders.find((o) => o.id === id) ?? null;
    if (!order) {
      return { order: null, customer: null, payments: [], delivery: null, events: [], status: "lead", demoMode: true };
    }
    const customers = getDemoTable("customers");
    const payments = getDemoTable("payments").filter((p) => p.order_id === id);
    const delivery = getDemoTable("deliveries").find((d) => d.order_id === id) ?? null;
    return {
      order,
      customer: customers.find((c) => c.id === order.customer_id) ?? null,
      payments,
      delivery,
      events: synthesizeEvents(order),
      status: normalizeStatus(order.order_status as string),
      demoMode: true,
    };
  }

  const supabase = await createClient();
  const [orderRes, paymentsRes, deliveryRes, eventsRes] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("payments").select("*").eq("order_id", id).order("created_at"),
    supabase.from("deliveries").select("*").eq("order_id", id).maybeSingle(),
    supabase.from("order_events").select("*").eq("order_id", id).order("created_at"),
  ]);
  const order = orderRes.data ?? null;
  let customer: Record<string, unknown> | null = null;
  if (order?.customer_id) {
    const { data } = await supabase.from("customers").select("*").eq("id", order.customer_id).maybeSingle();
    customer = data ?? null;
  }
  return {
    order,
    customer,
    payments: paymentsRes.data ?? [],
    delivery: deliveryRes.data ?? null,
    events: (eventsRes.data ?? []) as OrderEvent[],
    status: normalizeStatus((order?.order_status as string) ?? ""),
    demoMode: false,
  };
}

export function isKnownStatus(s: string): s is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(s);
}
