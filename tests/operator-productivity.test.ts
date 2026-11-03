import { describe, expect, it } from 'vitest';
import { recordsCsv, reviewRequest } from '../src/lib/operator-productivity';

describe('operator exports', () => {
  it('quotes commas, quotes and line breaks and keeps Unicode', () => {
    expect(recordsCsv([{ name: 'أحمد, "A"\nB', absent: null }], ['name', 'absent']))
      .toBe('\uFEFF"name","absent"\r\n"أحمد, ""A""\nB",""');
  });
  it('neutralises formula injection after whitespace and control prefixes', () => {
    for (const value of ['=HYPERLINK("bad")', ' +1', '\t@SUM(A1)', '\r-1']) {
      expect(recordsCsv([{ value }], ['value'])).toContain('"\'' + value.replaceAll('"', '""') + '"');
    }
  });
});

describe('review collection', () => {
  it('only drafts requests for delivered orders', () => {
    for (const status of ['draft', 'shipped', 'cancelled', undefined]) {
      expect(reviewRequest({ order_status: status })).toBeNull();
    }
    expect(reviewRequest({ order_status: 'delivered' })).toContain('Honest feedback of any kind');
    expect(reviewRequest({ order_status: 'delivered' })).toContain('separate, explicit permission');
  });
});

import { parseReviewCapture, parseReviewRequest, reviewRequestState } from '../src/lib/operator-productivity';

const ORDER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('review request dedup', () => {
  const delivered = { id: ORDER, order_status: 'delivered' };
  it('is eligible only for delivered orders with no request and no review', () => {
    expect(reviewRequestState(delivered, [], [])).toEqual({ eligible: true, reason: 'eligible' });
    expect(reviewRequestState({ id: ORDER, order_status: 'shipped' }, [], [])).toEqual({ eligible: false, reason: 'not_delivered' });
  });
  it('blocks a second request for the same order and reports the channel', () => {
    expect(reviewRequestState(delivered, [{ order_id: ORDER, channel: 'whatsapp' }], []))
      .toEqual({ eligible: false, reason: 'already_requested', channel: 'whatsapp' });
    expect(reviewRequestState(delivered, [{ order_id: OTHER, channel: 'whatsapp' }], []).eligible).toBe(true);
  });
  it('a captured review wins over a recorded request', () => {
    expect(reviewRequestState(delivered, [{ order_id: ORDER, channel: 'other' }], [{ order_id: ORDER }]).reason)
      .toBe('already_reviewed');
  });
});

describe('review input validation', () => {
  it('accepts a request with a known channel and rejects the rest', () => {
    expect(parseReviewRequest({ order_id: ORDER, channel: 'instagram' })).toEqual({ ok: true, value: { order_id: ORDER, channel: 'instagram' } });
    expect(parseReviewRequest({ order_id: ORDER, channel: 'sms' }).ok).toBe(false);
    expect(parseReviewRequest({ order_id: 'not-a-uuid', channel: 'whatsapp' }).ok).toBe(false);
    expect(parseReviewRequest({ order_id: ORDER, channel: 'whatsapp', note: 'x'.repeat(501) }).ok).toBe(false);
  });
  it('only records sharing permission from an explicit yes', () => {
    const base = { order_id: ORDER, rating: '4', feedback: '  Loved the engraving.  ' };
    const yes = parseReviewCapture({ ...base, permission_to_share: 'yes', story_mention: '' });
    expect(yes).toEqual({ ok: true, value: { order_id: ORDER, rating: 4, feedback: 'Loved the engraving.', permission_to_share: true, story_mention: false } });
    for (const v of ['ok', 'sure', 'true', 'YES', 1, undefined, null]) {
      const r = parseReviewCapture({ ...base, permission_to_share: v, story_mention: v });
      expect(r.ok, String(v)).toBe(true);
      if (r.ok) expect(r.value.permission_to_share, String(v)).toBe(false);
    }
  });
  it('rejects out-of-range ratings and empty feedback', () => {
    expect(parseReviewCapture({ order_id: ORDER, rating: 6, feedback: 'x' }).ok).toBe(false);
    expect(parseReviewCapture({ order_id: ORDER, rating: 0, feedback: 'x' }).ok).toBe(false);
    expect(parseReviewCapture({ order_id: ORDER, rating: 3, feedback: '   ' }).ok).toBe(false);
    const r = parseReviewCapture({ order_id: ORDER, rating: 'five', feedback: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^rating:/);
  });
});
