import { describe, expect, it, vi } from 'vitest';
import { createAiQuotaStore } from './quota';

describe('hosted AI quota admission', () => {
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
    expect(commands[0]?.slice(0, 6)).toEqual(['EVAL', expect.any(String), 6,
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
