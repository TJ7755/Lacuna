import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeInternalError, parseRoute } from '../src/relay.js';

const relayRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const PUBLIC_PATHS = ['/channel', '/c/:id', '/c/:id/:slot'] as const;
const API_ALIASES = ['/api/channel', '/api/c/:id', '/api/c/:id/:slot'] as const;

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
    expect(parseRoute('https://relay.example/api/c/aabbccddeeff00112233445566778899/keybag')).toEqual({
      kind: 'slot',
      id: 'aabbccddeeff00112233445566778899',
      slot: 'keybag',
    });
    expect(parseRoute('https://relay.example/c/aabbccddeeff00112233445566778899/notes')).toEqual({
      kind: 'slot-invalid',
    });
  });

  it('recovers a route after a rewrite that collapses the pathname to /api', () => {
    expect(parseRoute('https://relay.example/api?__path=/channel')).toEqual({ kind: 'channel' });
    expect(parseRoute('https://relay.example/api?__path=/api/channel')).toEqual({ kind: 'channel' });
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
  });
});

describe('vercel routing contract', () => {
  it('sends every multi-segment public path to api/index.ts, not a catch-all file', () => {
    const config = JSON.parse(readFileSync(join(relayRoot, 'vercel.json'), 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(existsSync(join(relayRoot, 'api/index.ts'))).toBe(true);
    expect(existsSync(join(relayRoot, 'api/[...path].ts'))).toBe(false);
    expect(existsSync(join(relayRoot, 'api/[[...path]].ts'))).toBe(false);

    for (const source of [...PUBLIC_PATHS, ...API_ALIASES]) {
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
