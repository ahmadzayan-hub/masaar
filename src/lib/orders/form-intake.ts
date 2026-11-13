import { getAdminClient } from "@/lib/supabase/admin";
import { IntakeOrder, leadToSheetRow } from "./sink";
import { appendRow, SheetResult } from "@/lib/sheets/client";

export class IntakeConflict extends Error {}
export async function ingestSubmission(submissionId: string, payload: Record<string, unknown>, intake: IntakeOrder) {
  const db = getAdminClient();
  if (!db) throw new Error("Durable intake storage is not configured");
  const { data, error } = await db.rpc("ingest_form_submission", {
    p_submission_id: submissionId, p_payload: payload, p_token: intake.token, p_intake: intake,
  });
  if (error?.code === "23505") throw new IntakeConflict("Idempotency key was reused with different data");
  if (error || !data?.token) throw new Error("Intake transaction failed");
  return data as { token: string; created: boolean; notification_sent: boolean; status: string };
}
export async function markSubmissionNotified(submissionId: string): Promise<void> {
  const db = getAdminClient();
  if (!db) throw new Error("Durable intake storage is not configured");
  const { data, error } = await db.from("form_intake_receipts").update({ notification_sent: true })
    .eq("submission_id", submissionId).select("submission_id").maybeSingle();
  if (error || !data) throw new Error("Notification receipt was not saved");
}
export async function mirrorNewSubmission(intake: IntakeOrder): Promise<SheetResult> {
  // Append only on the first committed ingestion. Retrying an uncertain append
  // risks duplicating a live system-of-record row; reconciliation is explicit.
  const result = await appendRow(leadToSheetRow(intake));
  if (result.ok && result.provider === "google_sheets") {
    const db = getAdminClient();
    const write = await db?.from("intake_orders").update({ sheet_synced: true }).eq("confirmation_token", intake.token);
    if (!write || write.error) return { ok: false, provider: "google_sheets", error: "Sheet mirror receipt requires reconciliation" };
  }
  return result;
}
