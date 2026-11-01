import { expect, it, vi } from 'vitest';
import { handleAiMaintenanceRoute, AI_CLEANUP_GRACE_MS } from '../src/aiMaintenance.js';
import {
  consumeCounterPermit,
  consumeRatePermit,
  encodeRateRecord,
  RATE_KEY_RE,
  rateLimitForKey,
} from '../src/rateLimit.js';
import { MemoryStore } from '../src/store.js';

const digest = 'a'.repeat(64);
const shard = `ai-rate/class-code/${digest}/15`;

it('accepts shard suffixes only on class-code keys and preserves legacy limits', () => {
  expect(RATE_KEY_RE.test(shard)).toBe(true);
  expect(rateLimitForKey(shard)).toBe(38);
  expect(RATE_KEY_RE.test(`ai-rate/class-code/${digest}`)).toBe(true);
  expect(rateLimitForKey(`ai-rate/class-code/${digest}`)).toBe(600);
  for (const suffix of ['16', '-1', '00', '1/2'])
    expect(RATE_KEY_RE.test(`ai-rate/class-code/${digest}/${suffix}`)).toBe(false);
  for (const scope of ['pairing', 'channel-mint', 'share-mint', 'insights']) {
    expect(RATE_KEY_RE.test(`ai-rate/${scope}/${digest}`)).toBe(true);
    expect(RATE_KEY_RE.test(`ai-rate/${scope}/${digest}/0`)).toBe(false);
    expect(rateLimitForKey(`ai-rate/${scope}/${digest}`)).toBe(scope === 'insights' ? 100 : 10);
  }
});

it('tries two other distinct shards when the first shards are full', async () => {
  const store = new MemoryStore();
  const get = vi.spyOn(store, 'get');
  get.mockResolvedValue({
    body: encodeRateRecord({ version: 1, count: 38, resetAt: 3_600_000 }),
    etag: '"1"',
    uploadedAt: 0,
  });
  const request = new Request('https://relay.test');
  expect(await consumeRatePermit(store, request, 0, 'class-code')).toBe('limited');
  expect(new Set(get.mock.calls.map(([key]) => key)).size).toBe(3);
  get.mockClear();
  get
    .mockResolvedValueOnce({
      body: encodeRateRecord({ version: 1, count: 38, resetAt: 3_600_000 }),
      etag: '"1"',
      uploadedAt: 0,
    })
    .mockResolvedValueOnce(null);
  expect(await consumeRatePermit(store, request, 0, 'class-code')).toBe('allowed');
  expect(get).toHaveBeenCalledTimes(2);
});

it.each([
  ['class-code', 8],
  ['pairing', 5],
] as const)('bounds %s CAS retries at %s attempts', async (scope, attempts) => {
  const store = new MemoryStore();
  const put = vi.spyOn(store, 'put').mockResolvedValue({ ok: false, reason: 'precondition' });
  expect(
    await consumeCounterPermit(store, `ai-rate/${scope}/${digest}/0`, 0, {
      limit: 38,
      windowMs: 3_600_000,
    }),
  ).toBe('unavailable');
  expect(put).toHaveBeenCalledTimes(attempts);
});

it('retains active shards and clears expired shards and legacy counters during maintenance', async () => {
  const store = new MemoryStore(() => 0);
  vi.stubEnv('CRON_SECRET', 'test-cron');
  const cleanup = async (now: number) => {
    const response = await handleAiMaintenanceRoute(
      store,
      new Request('https://relay.test/ai/maintenance', {
        headers: { Authorization: 'Bearer test-cron' },
      }),
      now,
    );
    return response.json() as Promise<{ rateRecordsDeleted: number }>;
  };
  const legacy = `ai-rate/class-code/${digest}`;
  for (const [key, count] of [
    [shard, 38],
    [legacy, 600],
  ] as const)
    await store.put(key, encodeRateRecord({ version: 1, count, resetAt: 3_600_000 }), {
      exclusive: true,
    });
  expect((await cleanup(AI_CLEANUP_GRACE_MS)).rateRecordsDeleted).toBe(0);
  expect((await cleanup(AI_CLEANUP_GRACE_MS + 3_600_000)).rateRecordsDeleted).toBe(2);
  vi.unstubAllEnvs();
  for (const key of [shard, legacy])
    expect(JSON.parse(new TextDecoder().decode((await store.get(key))!.body))).toEqual({
      version: 1,
      count: 0,
      resetAt: 0,
    });
});
