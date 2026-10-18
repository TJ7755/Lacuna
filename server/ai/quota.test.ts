import { describe, expect, it, vi } from 'vitest';
import { createAiQuotaStore, createSessionExchangeLimiter, SESSION_EXCHANGE_LIMITS } from './quota';

function quotaFixture(initialTimestamp = Date.UTC(2026, 9, 18, 12)) {
  let timestamp = initialTimestamp;
  const counts = new Map<string, number>();
  const active = new Map<string, Set<string>>();
  const members = (key: string) => {
    if (!active.has(key)) active.set(key, new Set());
    return active.get(key)!;
  };
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const command = JSON.parse(String(init?.body)) as (string | number)[];
    const keyCount = Number(command[2]);
    const keys = command.slice(3, 3 + keyCount).map(String);
    const args = command.slice(3 + keyCount);
    const identifier = String(args[0]);
    if (keyCount === 2) {
      for (const key of keys) members(key).delete(identifier);
      return Response.json({ result: 1 });
    }
    const counterKeys = keys.slice(0, -2);
    const limits = args.slice(2).map(Number);
    if (counterKeys.some((key, index) => (counts.get(key) ?? 0) >= limits[index]!) ||
      keys.slice(-2).some((key, index) => members(key).size >= limits[counterKeys.length + index]!)) {
      return Response.json({ result: 0 });
    }
    for (const key of counterKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const key of keys.slice(-2)) members(key).add(identifier);
    return Response.json({ result: 1 });
  }) as unknown as typeof fetch;
  return {
    store: createAiQuotaStore('https://quota.example', 'server-secret', undefined, fetcher, () => timestamp),
    advance: (milliseconds: number) => { timestamp += milliseconds; },
    counts,
  };
}

describe('hosted AI quota admission', () => {
  it('admits two complete nine-step audits in one minute, then caps the burst at twenty steps', async () => {
    const { store, advance } = quotaFixture();
    for (let step = 0; step < 20; step += 1) {
      const release = await store.reserve('learner_1');
      expect(release, `step ${step + 1}`).toBeTypeOf('function');
      await release!();
    }
    expect(await store.reserve('learner_1')).toBeNull();
    advance(60_000);
    expect(await store.reserve('learner_1')).toBeTypeOf('function');
  });

  it('admits two simultaneous testers but retains the shared and individual concurrency caps', async () => {
    const { store } = quotaFixture();
    const releases: (() => Promise<void>)[] = [];
    for (let learner = 0; learner < 2; learner += 1) {
      for (let request = 0; request < 2; request += 1) {
        const release = await store.reserve(`learner_${learner}`);
        expect(release).toBeTypeOf('function');
        releases.push(release!);
      }
    }
    expect(await store.reserve('learner_2')).toBeNull();
    await Promise.all(releases.map((release) => release()));
    const first = await store.reserve('learner_1');
    const second = await store.reserve('learner_1');
    expect(first).toBeTypeOf('function');
    expect(second).toBeTypeOf('function');
    expect(await store.reserve('learner_1')).toBeNull();
    await first!();
    expect(await store.reserve('learner_1')).toBeTypeOf('function');
  });

  it('retains daily and monthly individual ceilings after completed steps release their leases', async () => {
    const { store, advance } = quotaFixture(Date.UTC(2026, 9, 1, 12));
    for (let step = 0; step < 3_000; step += 1) {
      if (step > 0 && step % 200 === 0) {
        expect(await store.reserve('learner_1')).toBeNull();
        advance(86_400_000);
      } else if (step > 0 && step % 20 === 0) {
        advance(60_000);
      }
      const release = await store.reserve('learner_1');
      expect(release, `step ${step + 1}`).toBeTypeOf('function');
      await release!();
    }
    advance(86_400_000);
    expect(await store.reserve('learner_1')).toBeNull();
  });

  it('caps aggregate monthly usage even when twenty issued codes each have allowance remaining', async () => {
    const { store, counts } = quotaFixture();
    // A new month counter must participate in the same atomic reservation as the other caps.
    counts.set('lacuna:ai:month:global:2026-10', 5_980);
    for (let learner = 0; learner < 20; learner += 1) {
      const release = await store.reserve(`learner_${learner}`);
      expect(release).toBeTypeOf('function');
      await release!();
    }
    expect(await store.reserve('learner_0')).toBeNull();
  });

  it('retains the global daily ceiling and admits work when its calendar window resets', async () => {
    const { store, counts, advance } = quotaFixture();
    counts.set('lacuna:ai:day:global:2026-10-18', 399);
    const release = await store.reserve('learner_1');
    expect(release).toBeTypeOf('function');
    await release!();
    expect(await store.reserve('learner_2')).toBeNull();
    advance(86_400_000);
    expect(await store.reserve('learner_2')).toBeTypeOf('function');
  });

  it('uses one atomic reservation across user and global limits and releases it once', async () => {
    const commands: unknown[][] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body)) as unknown[];
      commands.push(command);
      return Response.json({ result: 1 });
    }) as unknown as typeof fetch;
    const store = createAiQuotaStore('https://quota.example', 'server-secret', undefined, fetcher,
      () => Date.UTC(2026, 8, 25, 12));
    const release = await store.reserve('learner_1');
    expect(release).toBeTypeOf('function');
    expect(commands[0]?.slice(0, 6)).toEqual(['EVAL', expect.any(String), 7,
      'lacuna:ai:day:user:learner_1:2026-09-25',
      'lacuna:ai:month:user:learner_1:2026-09',
      'lacuna:ai:day:global:2026-09-25']);
    await release!();
    await release!();
    expect(commands).toHaveLength(2);
    expect(commands[1]?.slice(0, 5)).toEqual(['EVAL', expect.any(String), 2,
      'lacuna:ai:active:user:learner_1', 'lacuna:ai:active:global']);
  });

  it('treats a denied reservation or store failure as unavailable', async () => {
    const denied = createAiQuotaStore('https://quota.example', 'server-secret', undefined,
      vi.fn(async () => Response.json({ result: 0 })) as typeof fetch);
    expect(await denied.reserve('learner_1')).toBeNull();
    const failed = createAiQuotaStore('https://quota.example', 'server-secret', undefined,
      vi.fn(async () => new Response('error', { status: 503 })) as typeof fetch);
    await expect(failed.reserve('learner_1')).rejects.toThrow('unavailable');
    expect(() => createAiQuotaStore('http://quota.example', 'server-secret')).toThrow();
  });
});

describe('session exchange rate limit', () => {
  it('counts attempts per hashed address against minute and day windows', async () => {
    const commands: unknown[][] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      commands.push(JSON.parse(String(init?.body)) as unknown[]);
      return Response.json({ result: commands.length === 1 ? 1 : 0 });
    }) as unknown as typeof fetch;
    const limiter = createSessionExchangeLimiter('https://quota.example', 'server-secret', fetcher,
      () => Date.UTC(2026, 8, 25, 12));

    expect(await limiter.allow('203.0.113.7')).toBe(true);
    expect(await limiter.allow('203.0.113.7')).toBe(false);
    const [, , keyCount, minuteKey, dayKey, perMinute, perDay] = commands[0]!;
    expect(keyCount).toBe(2);
    expect(minuteKey).toMatch(/^lacuna:ai:session:minute:[a-f0-9]{64}:\d+$/);
    expect(dayKey).toMatch(/^lacuna:ai:session:day:[a-f0-9]{64}:2026-09-25$/);
    expect(JSON.stringify(commands)).not.toContain('203.0.113.7');
    expect([perMinute, perDay]).toEqual([SESSION_EXCHANGE_LIMITS.perMinute, SESSION_EXCHANGE_LIMITS.perDay]);
  });
});
