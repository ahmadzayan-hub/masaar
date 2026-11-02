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
