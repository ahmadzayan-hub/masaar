export const REPLY_LIBRARY = [
  { key: 'welcome', title: 'Welcome', text: 'Thanks for contacting Beyond Style UAE. Which item would you like help with?' },
  { key: 'details', title: 'Personalisation details', text: 'Please confirm the exact spelling, preferred finish and quantity. We will review availability and pricing before confirming your order.' },
  { key: 'payment', title: 'Payment verification', text: 'Thank you. We will check the payment record and confirm once it has been verified.' },
  { key: 'delivery', title: 'Delivery enquiry', text: 'We will check the latest order and courier status before confirming a delivery update.' },
  { key: 'complaint', title: 'Complaint acknowledgement', text: 'Thank you for raising this. We will ask the owner to review the details and respond with the next step.' },
] as const;

// Quote every field and neutralise spreadsheet formula prefixes, including
// whitespace/control characters that spreadsheet importers may strip.
export function recordsCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (value: unknown) => {
    let text = value == null ? '' : String(value);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [columns.map(cell).join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n');
}

export function reviewRequest(order: Record<string, unknown>): string | null {
  if (order.order_status !== 'delivered') return null;
  return 'Thank you for your order from Beyond Style UAE. How was your experience? Honest feedback of any kind is welcome. If you would like us to share your review publicly, please give separate, explicit permission. Sharing is optional.';
}

// ---------------------------------------------------------------------------
// Phase 2 second half: review request dedup + review capture.
//
// Requests are still sent manually. What is persisted is the fact that one
// was sent (one per order) and, later, the review the customer gave. The
// permission_to_share flag is only ever true from an explicit 'yes' that the
// operator records; it is never inferred from the tone of a reply.
// ---------------------------------------------------------------------------
import { z } from 'zod';

export const REVIEW_CHANNELS = ['whatsapp', 'instagram', 'other'] as const;
export type ReviewChannel = (typeof REVIEW_CHANNELS)[number];

export type ReviewRequestReason = 'not_delivered' | 'already_reviewed' | 'already_requested' | 'eligible';

export interface ReviewRequestState {
  eligible: boolean;
  reason: ReviewRequestReason;
  /** Channel of the recorded request, when one exists. */
  channel?: string;
}

export const REVIEW_REQUEST_LABELS: Record<ReviewRequestReason, string> = {
  not_delivered: 'Not delivered yet',
  already_reviewed: 'Review captured',
  already_requested: 'Request already sent',
  eligible: 'Ready to request',
};

/** Decide whether a review request may be drafted for an order, given what was already recorded. */
export function reviewRequestState(
  order: Record<string, unknown>,
  requests: Record<string, unknown>[],
  reviews: Record<string, unknown>[],
): ReviewRequestState {
  if (!reviewRequest(order)) return { eligible: false, reason: 'not_delivered' };
  const id = String(order.id ?? '');
  if (reviews.some(r => String(r.order_id ?? '') === id)) return { eligible: false, reason: 'already_reviewed' };
  const request = requests.find(r => String(r.order_id ?? '') === id);
  if (request) return { eligible: false, reason: 'already_requested', channel: String(request.channel ?? '') || undefined };
  return { eligible: true, reason: 'eligible' };
}

export const reviewRequestInputSchema = z.object({
  order_id: z.string().uuid(),
  channel: z.enum(REVIEW_CHANNELS),
  note: z.string().trim().max(500).optional(),
});
export type ReviewRequestInput = z.infer<typeof reviewRequestInputSchema>;

// Consent flags accept only the literal 'yes' (or boolean true from a typed
// client). Any other value, including 'ok', 'sure' or 'true', records false.
const explicitYes = z.unknown().transform(v => v === 'yes' || v === true);

export const reviewCaptureSchema = z.object({
  order_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  feedback: z.string().trim().min(1).max(2000),
  permission_to_share: explicitYes,
  story_mention: explicitYes,
});
export type ReviewCapture = z.infer<typeof reviewCaptureSchema>;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid input';
}

export function parseReviewRequest(raw: unknown): Parsed<ReviewRequestInput> {
  const r = reviewRequestInputSchema.safeParse(raw);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: firstIssue(r.error) };
}

export function parseReviewCapture(raw: unknown): Parsed<ReviewCapture> {
  const r = reviewCaptureSchema.safeParse(raw);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: firstIssue(r.error) };
}
