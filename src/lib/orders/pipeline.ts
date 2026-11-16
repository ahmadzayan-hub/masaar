// Pipeline view-model over the canonical order lifecycle (lifecycle.ts is the
// authority for statuses/transitions; this module only shapes them for the
// Mission Control board).
import { ORDER_STATUSES, STATUS_LABELS, normalizeStatus, type OrderStatus } from "./lifecycle";

export interface PipelineStage {
  key: OrderStatus;
  label: string;
  labelAr: string;
  /** Main flow stages render in the band; terminal ones render as outcomes. */
  kind: "flow" | "outcome";
}

export const PIPELINE_STAGES: PipelineStage[] = ORDER_STATUSES.map((key) => ({
  key,
  label: STATUS_LABELS[key].en,
  labelAr: STATUS_LABELS[key].ar,
  kind: key === "delivered" || key === "after_sales" || key === "cancelled" ? "outcome" : "flow",
}));

export type StageCounts = Record<OrderStatus, number>;

export function stageCounts(orders: Array<Record<string, unknown>>): StageCounts {
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as StageCounts;
  for (const o of orders) {
    counts[normalizeStatus(o.order_status as string)] += 1;
  }
  return counts;
}

/** The "TODAY" strip — what is happening / what needs me, in six numbers. */
export interface TodaySummary {
  needConfirmation: number; // lead + qualified
  awaitingPayment: number; // confirmed
  inProduction: number; // design_approval + production
  inQc: number; // qc
  withCourier: number; // dispatched
  problems: number; // after_sales
}

export function todaySummary(counts: StageCounts): TodaySummary {
  return {
    needConfirmation: counts.lead + counts.qualified,
    awaitingPayment: counts.confirmed,
    inProduction: counts.design_approval + counts.production,
    inQc: counts.qc,
    withCourier: counts.dispatched,
    problems: counts.after_sales,
  };
}

export function filterByStage<T extends Record<string, unknown>>(
  orders: T[],
  stage: string | undefined,
): T[] {
  if (!stage) return orders;
  const wanted = normalizeStatus(stage);
  return orders.filter((o) => normalizeStatus(o.order_status as string) === wanted);
}

export const ATTENTION_QUEUES = [
  { key: "payment", label: "Check payment", role: "Finance" },
  { key: "quality", label: "Complete quality check", role: "Workshop" },
  { key: "dispatch", label: "Arrange dispatch", role: "Operations" },
] as const;

type QueueKey = (typeof ATTENTION_QUEUES)[number]["key"];

export function orderAttention<T extends Record<string, unknown>>(orders: T[]): Record<QueueKey, T[]> {
  const queues: Record<QueueKey, T[]> = { payment: [], quality: [], dispatch: [] };
  for (const order of orders) {
    if (order.locked_by_dispute) continue;
    const stage = normalizeStatus(order.order_status as string);
    if (stage !== "confirmed" && stage !== "qc") continue;
    if (stage === "confirmed" || order.payment_status !== "confirmed") {
      queues.payment.push(order);
      continue;
    }
    const qc = order.qc as { passed?: boolean } | null | undefined;
    queues[qc?.passed === true ? "dispatch" : "quality"].push(order);
  }
  return queues;
}
