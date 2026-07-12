// Shared webhook/API auth: optional shared-secret gate used by the intake,
// confirmations, and resend endpoints. When WEBHOOK_SECRET is unset the check is
// a no-op (open); when set, callers must send a matching x-webhook-secret header.
import { NextRequest } from "next/server";

export function checkWebhookSecret(req: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  return !secret || req.headers.get("x-webhook-secret") === secret;
}
