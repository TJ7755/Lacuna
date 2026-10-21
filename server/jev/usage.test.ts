import { expect, it, vi } from 'vitest';
import { createJevUsageStore } from './usage';

it('admits from the local total while a single background refresh is pending', async () => {
  let now = Date.parse('2026-10-21T10:00:00Z');
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const store = createJevUsageStore('https://redis.example', 'key', fetcher, () => now);
  expect(store.allowed(1000)).toBe(true);
  const refresh = store.refresh();
  expect(store.refresh()).toBeNull();
  expect(store.allowed(1000)).toBe(true);
  resolve(Response.json({ result: '1001' }));
  await refresh;
  expect(store.allowed(1000)).toBe(false);
  expect(store.allowed(0)).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  now += 60_000;
  const next = store.refresh();
  expect(fetcher).toHaveBeenCalledTimes(2);
  resolve(Response.json({ result: '1001' }));
  await next;
});

it('keeps local usage when Redis fails and only retries refresh after a minute', async () => {
  let now = Date.parse('2026-10-21T10:00:00Z');
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
  const store = createJevUsageStore('https://redis.example', 'key', fetcher, () => now);
  await expect(store.record(1001)).rejects.toThrow();
  expect(store.allowed(1000)).toBe(false);
  await expect(store.refresh()).rejects.toThrow();
  now += 59_999;
  expect(store.refresh()).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  now++;
  await expect(store.refresh()).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('ignores old-month refreshes and attributes late records to the request UTC day', async () => {
  let now = Date.parse('2026-12-31T23:59:59Z');
  const requestedAt = now;
  let resolve!: (response: Response) => void;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    )
    .mockImplementation(async () => Response.json({ result: 1 }));
  const store = createJevUsageStore('https://redis.example', 'key', fetcher, () => now);
  const pending = store.refresh();
  now += 1000;
  expect(store.allowed(1000)).toBe(true);
  resolve(Response.json({ result: '2000' }));
  await pending;
  expect(store.allowed(1000)).toBe(true);
  await store.record(1001, requestedAt);
  expect(store.allowed(1000)).toBe(true);
  expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toContain(
    'lacuna:jev:day:2026-12-31:input-tokens',
  );
  await store.record(1000);
  expect(store.allowed(1000)).toBe(true);
  await store.record(1);
  expect(store.allowed(1000)).toBe(false);
});
