import { expect, it, vi } from 'vitest';
import { createJevUsageStore, loadJevLimit } from './usage';

const timestamp = Date.parse('2026-12-31T23:59:30Z');
const options = { monthlyTokens: 50_000_000, monthlyRequests: 100_000, maintainer: false };
it.each([
  [-1, 0, 'installation-day', Date.parse('2027-01-01T00:00:00Z')],
  [-2, 0, 'installation-minute', Date.parse('2027-01-01T00:00:00Z')],
  [-3, 12500, 'installation-concurrent', timestamp + 12500],
  [-4, 0, 'monthly-tokens', Date.parse('2027-01-01T00:00:00Z')],
  [-5, 0, 'monthly-requests', Date.parse('2027-01-01T00:00:00Z')],
  [-6, 30000, 'global-concurrent', timestamp + 30000],
])(
  'translates Redis denial %s into the actual allowance reset',
  async (code, delay, reason, retryAt) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ result: [code, delay] }));
    const store = createJevUsageStore('https://redis.example', 'key', fetcher, () => timestamp);
    expect(await store.reserve('a'.repeat(64), options)).toEqual({
      allowed: false,
      reason,
      retryAt,
    });
  },
);

it('refuses admission when authoritative Redis state is unavailable or malformed', async () => {
  for (const result of [null, 1, [1], ['1', 0], [-99, 0], [1, -1]]) {
    const store = createJevUsageStore(
      'https://redis.example',
      'key',
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result })),
    );
    await expect(store.reserve('a'.repeat(64), options)).rejects.toThrow(
      'Invalid Jev quota response',
    );
  }
  const unavailable = createJevUsageStore(
    'https://redis.example',
    'key',
    vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
  );
  await expect(unavailable.reserve('a'.repeat(64), options)).rejects.toThrow('offline');
});

it('does not allow zero, fractional or unsafe public budget limits', () => {
  expect(loadJevLimit(undefined)).toBe(50_000_000);
  expect(loadJevLimit('10')).toBe(10);
  for (const value of ['0', '-1', '1.5', '9007199254740992', ''])
    expect(loadJevLimit(value)).toBeNull();
});
