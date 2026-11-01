import { describe, expect, it } from 'vitest';
import {
  insightDayExpiresAt,
  parseInsightEnvelope,
  requireInsightDay,
} from '../src/insightsProtocol.js';

const context = { shareId: 'a'.repeat(32), isoDay: '2026-10-18' };
const envelope = {
  v: 2,
  s: context.shareId,
  d: context.isoDay,
  k: 'b'.repeat(64),
  x: Buffer.alloc(384).toString('base64'),
  n: Buffer.alloc(12).toString('base64'),
  c: Buffer.alloc(16).toString('base64'),
};

describe('insights envelope boundary', () => {
  it('accepts encrypted fields with matching routing context', () => {
    expect(parseInsightEnvelope(envelope, context)).toEqual(envelope);
    expect(() => parseInsightEnvelope(envelope, { ...context, shareId: 'c'.repeat(32) })).toThrow();
    expect(() => parseInsightEnvelope(envelope, { ...context, isoDay: '2026-10-17' })).toThrow();
  });
  it.each([
    null,
    { ...envelope, v: 3 },
    { ...envelope, pupilName: 'Do not store this' },
    { ...envelope, s: 'invalid' },
    { ...envelope, d: '2025-02-30' },
    { ...envelope, k: 'invalid' },
    { ...envelope, n: 'not base64' },
    { ...envelope, n: Buffer.alloc(13).toString('base64') },
    { ...envelope, x: Buffer.alloc(383).toString('base64') },
    { ...envelope, c: '' },
    { ...envelope, c: Buffer.alloc(65_553).toString('base64') },
    { ...envelope, c: 'AB=='.repeat(4) },
  ])('rejects malformed or plaintext-bearing envelopes', (raw) => {
    expect(() => parseInsightEnvelope(raw)).toThrow();
  });
  it('allows today and eighty-four completed UTC days without extending fixed retention', () => {
    const now = Date.parse('2026-10-19T00:00:00Z');
    expect(() => requireInsightDay('2026-10-18', now)).not.toThrow();
    expect(() => requireInsightDay('2026-07-27', now)).not.toThrow();
    expect(() => requireInsightDay('2026-07-26', now)).toThrow();
    expect(() => requireInsightDay('2026-10-19', now)).not.toThrow();
    expect(() => requireInsightDay('2026-10-19', now - 1)).toThrow();
    expect(() => requireInsightDay('2026-10-19', now + 86_399_999)).not.toThrow();
    expect(() => requireInsightDay('2026-10-20', now)).toThrow();
    expect(insightDayExpiresAt('2026-07-26')).toBe(now);
    expect(() => requireInsightDay('2026-10-19', Number.NaN)).toThrow();
  });
});
