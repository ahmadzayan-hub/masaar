// Shared webhook/API auth.
//
// checkWebhookSecret: optional shared-secret gate for the operator endpoints
// (confirmations, resend). Those also sit behind the Supabase session middleware,
// so an unset WEBHOOK_SECRET leaves them to that session check.
//
// requireWebhookSecret: the gate for inbound webhooks, which the middleware
// deliberately leaves open (/api/webhook/*). It fails closed: with no
// WEBHOOK_SECRET configured every call is refused, unless unsigned webhooks were
// explicitly allowed for local development, which is never honoured on a Vercel
// production deployment.
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function sameSecret(expected: string, presented: string | null): boolean {
  if (!presented) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsignedWebhooksAllowed(): boolean {
  return process.env.MASAAR_ALLOW_UNSIGNED_WEBHOOKS === "1" && process.env.VERCEL_ENV !== "production";
}

export function checkWebhookSecret(req: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  return !secret || sameSecret(secret, req.headers.get("x-webhook-secret"));
}

export function requireWebhookSecret(req: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return unsignedWebhooksAllowed();
  return sameSecret(secret, req.headers.get("x-webhook-secret"));
}
