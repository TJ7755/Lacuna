import { describe, expect, it, vi, afterEach } from 'vitest';
import { CHANNEL_TTL_MS, createHandler } from '../src/relay.js';
import { CHANNEL_CLEANUP_GRACE_MS } from '../src/channelMaintenance.js';
import { MemoryStore } from '../src/store.js';

const ID = 'a'.repeat(32);
const DAY = 24 * 60 * 60 * 1000;
const secret = 'cron-secret';

function maintenance(handle: ReturnType<typeof createHandler>): Promise<Response> {
  return handle(new Request('https://relay.example/api/ai/maintenance', {
    headers: { Authorization: `Bearer ${secret}` },
  }));
}

afterEach(() => vi.unstubAllEnvs());

describe('channel maintenance', () => {
  it('reclaims an abandoned channel and is harmless on repeat', async () => {
    vi.stubEnv('CRON_SECRET', secret);
    let now = 0;
    const store = new MemoryStore(() => now);
    const handle = createHandler(store, { now: () => now });
    await store.put(`c/${ID}/meta`, new Uint8Array([1]), { exclusive: true });
    now = CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS;

    const first = await maintenance(handle);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ channelsDeleted: 1, channelObjectsDeleted: 1 });
    expect(await store.list(`c/${ID}/`)).toEqual([]);

    const second = await maintenance(handle);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ channelsDeleted: 0, channelObjectsDeleted: 0 });
  });

  it('keeps a channel alive when either slot has a recent upload', async () => {
    vi.stubEnv('CRON_SECRET', secret);
    let now = 0;
    const store = new MemoryStore(() => now);
    const handle = createHandler(store, { now: () => now });
    await store.put(`c/${ID}/meta`, new Uint8Array([1]), { exclusive: true });
    now = CHANNEL_TTL_MS - DAY;
    await store.put(`c/${ID}/keybag`, new Uint8Array([2]), { exclusive: true });
    now = CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS;

    expect((await maintenance(handle)).status).toBe(200);
    expect(await store.list(`c/${ID}/`)).toHaveLength(2);
  });

  it('skips a channel refreshed while cleanup is reading it', async () => {
    vi.stubEnv('CRON_SECRET', secret);
    let now = 0;
    class RacingStore extends MemoryStore {
      private refreshed = false;
      override async list(prefix: string) {
        const objects = await super.list(prefix);
        if (prefix === `c/${ID}/` && !this.refreshed) {
          this.refreshed = true;
          await this.put(`c/${ID}/state`, new Uint8Array([3]), { exclusive: true });
        }
        return objects;
      }
    }
    const store = new RacingStore(() => now);
    const handle = createHandler(store, { now: () => now });
    await store.put(`c/${ID}/meta`, new Uint8Array([1]), { exclusive: true });
    now = CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS;

    const response = await maintenance(handle);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ channelsDeleted: 0 });
    expect(await store.list(`c/${ID}/`)).toHaveLength(2);
  });

  it('limits each run to one page and reaches later channels on repeat', async () => {
    vi.stubEnv('CRON_SECRET', secret);
    let now = 0;
    const store = new MemoryStore(() => now);
    const handle = createHandler(store, { now: () => now });
    for (let index = 0; index < 101; index += 1) {
      const id = index.toString(16).padStart(32, '0');
      await store.put(`c/${id}/meta`, new Uint8Array([1]), { exclusive: true });
    }
    now = CHANNEL_TTL_MS + CHANNEL_CLEANUP_GRACE_MS;

    const first = await maintenance(handle);
    expect(await first.json()).toMatchObject({ channelsDeleted: 100 });
    expect(await store.list('c/')).toHaveLength(1);

    const second = await maintenance(handle);
    expect(await second.json()).toMatchObject({ channelsDeleted: 1 });
    expect(await store.list('c/')).toEqual([]);
  });
});
