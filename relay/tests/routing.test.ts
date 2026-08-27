import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHandler, describeInternalError, parseRoute } from '../src/relay.js';
import { MemoryStore, type PutOptions } from '../src/store.js';

const relayRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const PUBLIC_PATHS = ['/channel', '/c/:id', '/c/:id/:slot'] as const;
const API_ALIASES = ['/api/channel', '/api/c/:id', '/api/c/:id/:slot'] as const;
const AI_PUBLIC_PATHS = ['/ai/sessions', '/ai/s/:id', '/ai/s/:id/:action'] as const;
const AI_API_ALIASES = ['/api/ai/sessions', '/api/ai/s/:id', '/api/ai/s/:id/:action'] as const;
const AI_MAINTENANCE_PATHS = ['/ai/maintenance', '/api/ai/maintenance'] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseRoute', () => {
  it('matches the public Arc 8 paths and their /api aliases', () => {
    expect(parseRoute('https://relay.example/channel')).toEqual({ kind: 'channel' });
    expect(parseRoute('https://relay.example/api/channel')).toEqual({ kind: 'channel' });
    expect(parseRoute('https://relay.example/c/aabbccddeeff00112233445566778899')).toEqual({
      kind: 'item',
      id: 'aabbccddeeff00112233445566778899',
    });
    expect(parseRoute('https://relay.example/c/aabbccddeeff00112233445566778899/state')).toEqual({
      kind: 'slot',
      id: 'aabbccddeeff00112233445566778899',
      slot: 'state',
    });
    expect(
      parseRoute('https://relay.example/api/c/aabbccddeeff00112233445566778899/keybag'),
    ).toEqual({
      kind: 'slot',
      id: 'aabbccddeeff00112233445566778899',
      slot: 'keybag',
    });
    expect(parseRoute('https://relay.example/c/aabbccddeeff00112233445566778899/notes')).toEqual({
      kind: 'slot-invalid',
    });
    expect(parseRoute('https://relay.example/ai/sessions')).toEqual({
      kind: 'ai-session-collection',
    });
    expect(parseRoute('https://relay.example/ai/s/ABCD-EFGH-JKMN-PQRS-TVWZ/claim')).toEqual({
      kind: 'ai-claim',
      id: 'ABCDEFGHJKMNPQRSTVWZ',
    });
  });

  it('recovers a route after a rewrite that collapses the pathname to /api', () => {
    expect(parseRoute('https://relay.example/api?__path=/channel')).toEqual({ kind: 'channel' });
    expect(parseRoute('https://relay.example/api?__path=/api/channel')).toEqual({
      kind: 'channel',
    });
    expect(
      parseRoute('https://relay.example/api?__path=/c/aabbccddeeff00112233445566778899'),
    ).toEqual({ kind: 'item', id: 'aabbccddeeff00112233445566778899' });
    expect(
      parseRoute('https://relay.example/api?__path=/c/aabbccddeeff00112233445566778899/state'),
    ).toEqual({
      kind: 'slot',
      id: 'aabbccddeeff00112233445566778899',
      slot: 'state',
    });
    expect(
      parseRoute('https://relay.example/api?id=aabbccddeeff00112233445566778899&slot=keybag'),
    ).toEqual({
      kind: 'slot',
      id: 'aabbccddeeff00112233445566778899',
      slot: 'keybag',
    });
    expect(parseRoute('https://relay.example/api?id=aabbccddeeff00112233445566778899')).toEqual({
      kind: 'item',
      id: 'aabbccddeeff00112233445566778899',
    });
    expect(parseRoute('https://relay.example/api')).toEqual({ kind: 'unknown' });
    expect(parseRoute('https://relay.example/api/x/y/z')).toEqual({ kind: 'unknown' });
    expect(parseRoute('https://relay.example/api?__path=/ai/sessions')).toEqual({
      kind: 'ai-session-collection',
    });
    expect(
      parseRoute('https://relay.example/api?__path=/ai/s/ABCDEFGHJKMNPQRSTVWZ/browser'),
    ).toEqual({
      kind: 'ai-mailbox',
      id: 'ABCDEFGHJKMNPQRSTVWZ',
      mailbox: 'browser',
    });
    expect(parseRoute('https://relay.example/api/ai/maintenance')).toEqual({
      kind: 'ai-maintenance',
    });
  });
});

describe('AI maintenance route', () => {
  it('fails closed when CRON_SECRET is missing', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const handle = createHandler(new MemoryStore());

    const response = await handle(
      new Request('https://relay.example/api/ai/maintenance', {
        headers: { Authorization: 'Bearer configured-nowhere' },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('clears expired, corrupt and orphaned AI state only after the cleanup grace', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    let now = 0;
    const store = new MemoryStore(() => now);
    const handle = createHandler(store, { now: () => now });
    const publicKey = Buffer.from(new Uint8Array(65).fill(1)).toString('base64url');

    const expiredResponse = await handle(aiSessionRequest(publicKey, '198.51.100.41'));
    const expired = (await expiredResponse.json()) as { sessionId: string };
    const corruptId = 'B'.repeat(20);
    const orphanId = 'C'.repeat(20);
    await store.put(`ai/${corruptId}/meta`, new TextEncoder().encode('{broken'), {
      exclusive: true,
    });
    await store.put(`ai/${orphanId}/browser`, new Uint8Array([1]), { exclusive: true });
    await store.put('ai/unstructured', new Uint8Array([3]), { exclusive: true });
    await store.put('ai-rate/corrupt', new TextEncoder().encode('{broken'), { exclusive: true });

    now = 3 * 24 * 60 * 60 * 1000;
    const activeResponse = await handle(aiSessionRequest(publicKey, '198.51.100.42'));
    const active = (await activeResponse.json()) as { sessionId: string };
    const recentOrphanId = 'D'.repeat(20);
    await store.put(`ai/${recentOrphanId}/terminal`, new Uint8Array([2]), { exclusive: true });

    const response = await handle(
      new Request('https://relay.example/api/ai/maintenance', {
        headers: { Authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sessionsDeleted: 3,
      rateRecordsDeleted: 2,
      objectsDeleted: 5,
    });
    expect(await store.list(`ai/${expired.sessionId}/`)).toEqual([]);
    expect(await store.list(`ai/${corruptId}/`)).toEqual([]);
    expect(await store.list(`ai/${orphanId}/`)).toEqual([]);
    expect(await store.get('ai/unstructured')).toBeNull();
    expect(await store.list(`ai/${active.sessionId}/`)).toHaveLength(1);
    expect(await store.list(`ai/${recentOrphanId}/`)).toHaveLength(1);
    expect(await store.list('ai-rate/pairing/')).toHaveLength(2);
    expect((await handle(aiSessionRequest(publicKey, '198.51.100.41'))).status).toBe(201);
  });

  it('does not clear a pairing counter refreshed while cleanup is running', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    let now = 0;
    const store = new PairingCleanupRaceStore(() => now);
    const handle = createHandler(store, { now: () => now });
    const publicKey = Buffer.from(new Uint8Array(65).fill(1)).toString('base64url');
    const ip = '198.51.100.43';

    expect((await handle(aiSessionRequest(publicKey, ip))).status).toBe(201);
    now = 3 * 24 * 60 * 60 * 1000;
    store.raceWith(async () => {
      expect((await handle(aiSessionRequest(publicKey, ip))).status).toBe(201);
    });

    const cleanup = await handle(
      new Request('https://relay.example/api/ai/maintenance', {
        headers: { Authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(cleanup.status).toBe(200);
    for (let attempt = 0; attempt < 9; attempt += 1) {
      expect((await handle(aiSessionRequest(publicKey, ip))).status).toBe(201);
    }
    expect((await handle(aiSessionRequest(publicKey, ip))).status).toBe(429);
  });
});

describe('vercel routing contract', () => {
  it('sends every multi-segment public path to api/index.ts, not a catch-all file', () => {
    const config = JSON.parse(readFileSync(join(relayRoot, 'vercel.json'), 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(existsSync(join(relayRoot, 'api/index.ts'))).toBe(true);
    expect(existsSync(join(relayRoot, 'api/[...path].ts'))).toBe(false);
    expect(existsSync(join(relayRoot, 'api/[[...path]].ts'))).toBe(false);

    for (const source of [
      ...PUBLIC_PATHS,
      ...API_ALIASES,
      ...AI_PUBLIC_PATHS,
      ...AI_API_ALIASES,
      ...AI_MAINTENANCE_PATHS,
    ]) {
      const rewrite = config.rewrites.find((entry) => entry.source === source);
      expect(rewrite, `missing rewrite for ${source}`).toBeTruthy();
      const dest = new URL(rewrite!.destination, 'https://relay.example');
      expect(['/api', '/api/index']).toContain(dest.pathname);
      expect(dest.searchParams.get('__path')).toBe(source);
    }

    const slotRewrite = config.rewrites.find((entry) => entry.source === '/c/:id/:slot');
    expect(slotRewrite).toBeTruthy();
    const slotDest = new URL(slotRewrite!.destination, 'https://relay.example');
    expect(slotDest.pathname.split('/').filter(Boolean)).toHaveLength(1);
    expect(config.crons).toEqual([{ path: '/api/ai/maintenance', schedule: '0 3 * * *' }]);
  });
});

describe('runtime import specifiers', () => {
  it('gives every relative import a .js extension', () => {
    const files = listTypeScriptFiles(join(relayRoot, 'src'))
      .concat(listTypeScriptFiles(join(relayRoot, 'api')))
      .concat(listTypeScriptFiles(join(relayRoot, 'tests')));
    expect(files.length).toBeGreaterThan(0);

    const missing: string[] = [];
    const specifier = /from\s+['"](\.[^'"]+)['"]/g;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(specifier)) {
        const spec = match[1]!;
        if (!spec.endsWith('.js')) {
          missing.push(`${relative(relayRoot, file)}: ${spec}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('describeInternalError', () => {
  it('keeps the underlying cause and redacts channel ids and tokens', () => {
    const channelId = 'aabbccddeeff00112233445566778899';
    const token = 'ab'.repeat(32);
    const err = new Error('blob write failed', {
      cause: new Error(`Vercel Blob: no token for c/${channelId}/state token=${token}`),
    });
    const text = describeInternalError(err);
    expect(text).toContain('blob write failed');
    expect(text).toContain('no token');
    expect(text).not.toContain(channelId);
    expect(text).not.toContain(token);
    expect(text).toContain('[redacted]');
  });
});

function listTypeScriptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTypeScriptFiles(path));
    } else if (entry.name.endsWith('.ts')) {
      out.push(path);
    }
  }
  return out;
}

function aiSessionRequest(publicKey: string, ip: string): Request {
  const body = JSON.stringify({ browserPublicKey: publicKey });
  return new Request('https://relay.example/ai/sessions', {
    method: 'POST',
    headers: {
      'Content-Length': String(Buffer.byteLength(body)),
      'Content-Type': 'application/json',
      'x-vercel-forwarded-for': ip,
    },
    body,
  });
}

class PairingCleanupRaceStore extends MemoryStore {
  private pairingRace: (() => Promise<void>) | null = null;

  raceWith(pairing: () => Promise<void>): void {
    this.pairingRace = pairing;
  }

  override async put(key: string, body: Uint8Array, opts: PutOptions) {
    await this.runPairingRace(key);
    return super.put(key, body, opts);
  }

  override async del(keys: string[]): Promise<void> {
    await this.runPairingRace(keys.find((key) => key.startsWith('ai-rate/')) ?? '');
    await super.del(keys);
  }

  private async runPairingRace(key: string): Promise<void> {
    if (!key.startsWith('ai-rate/') || !this.pairingRace) return;
    const pairing = this.pairingRace;
    this.pairingRace = null;
    await pairing();
  }
}
