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
