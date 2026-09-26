import { describe, expect, it, vi } from 'vitest';
import {
  deleteShare,
  formatShareLink,
  getShareBytes,
  mintShare,
  parseShareCode,
  parseShareManifest,
  putShareBytes,
  ShareLinkError,
  shareLinkHash,
  StaleShareGenerationError,
  type ShareManifest,
} from './client';

const RELAY_URL = 'https://relay.example';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function bytesResponse(status: number, bytes: Uint8Array, etag: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Response(buffer, {
    status,
    headers: { 'Content-Type': 'application/octet-stream', ETag: etag },
  });
}

describe('share link client', () => {
  it('mints a share link', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(201, { shareId: 'a'.repeat(32), writeToken: 'b'.repeat(64) }),
    );
    const result = await mintShare(RELAY_URL, fetchImpl);
    expect(result).toEqual({ shareId: 'a'.repeat(32), writeToken: 'b'.repeat(64) });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${RELAY_URL}/shares`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refuses a malformed mint response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { shareId: 'short' }));
    await expect(mintShare(RELAY_URL, fetchImpl)).rejects.toThrow(ShareLinkError);
  });

  it('puts payload bytes and returns the generation', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204, headers: { ETag: '"t7"' } }));
    const result = await putShareBytes({
      relayUrl: RELAY_URL,
      shareId: 'a'.repeat(32),
      writeToken: 'b'.repeat(64),
      slot: 'payload',
      bytes: new Uint8Array([1, 2, 3]),
      ifMatch: '"0"',
      fetchImpl,
    });
    expect(result).toEqual({ generation: '"t7"' });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['If-Match']).toBe('"0"');
  });

  it('maps a stale generation to StaleShareGenerationError', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(412, { error: 'precondition failed' }));
    await expect(
      putShareBytes({
        relayUrl: RELAY_URL,
        shareId: 'a'.repeat(32),
        writeToken: 'b'.repeat(64),
        slot: 'payload',
        bytes: new Uint8Array([1]),
        ifMatch: '"t1"',
        fetchImpl,
      }),
    ).rejects.toThrow(StaleShareGenerationError);
  });

  it('gets slot bytes with their generation and returns null on 404', async () => {
    const bytes = new Uint8Array([9, 9]);
    const hit = vi.fn(async () => bytesResponse(200, bytes, '"t3"'));
    expect(
      await getShareBytes({ relayUrl: RELAY_URL, shareId: 'a'.repeat(32), slot: 'meta', fetchImpl: hit }),
    ).toEqual({ bytes, generation: '"t3"' });
    expect(hit).toHaveBeenCalledWith(
      `${RELAY_URL}/shares/${'a'.repeat(32)}/meta`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );

    const miss = vi.fn(async () => jsonResponse(404, { error: 'not found' }));
    expect(
      await getShareBytes({ relayUrl: RELAY_URL, shareId: 'a'.repeat(32), slot: 'meta', fetchImpl: miss }),
    ).toBeNull();
  });

  it('deletes a share and treats a missing share as deleted', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await deleteShare({ relayUrl: RELAY_URL, shareId: 'a'.repeat(32), writeToken: 'b'.repeat(64), fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${RELAY_URL}/shares/${'a'.repeat(32)}`,
      expect.objectContaining({ method: 'DELETE' }),
    );

    const gone = vi.fn(async () => jsonResponse(404, { error: 'not found' }));
    await expect(
      deleteShare({ relayUrl: RELAY_URL, shareId: 'a'.repeat(32), writeToken: 'b'.repeat(64), fetchImpl: gone }),
    ).resolves.toBeUndefined();
  });

  it('parses a manifest and rejects a corrupt one', () => {
    const manifest: ShareManifest = {
      v: 1,
      lineageId: 'lin_1',
      revision: 3,
      publishedAt: 1700000000000,
      byteSize: 1234,
      courseName: 'Biology',
    };
    expect(parseShareManifest(new TextEncoder().encode(JSON.stringify(manifest)))).toEqual(manifest);
    expect(() => parseShareManifest(new TextEncoder().encode('{broken'))).toThrow(
      'could not be read',
    );
    expect(() =>
      parseShareManifest(new TextEncoder().encode(JSON.stringify({ v: 1, revision: -2 }))),
    ).toThrow('could not be read');
  });

  it('accepts a bare code or a full link as a share code', () => {
    const id = 'a'.repeat(32);
    expect(parseShareCode(id)).toBe(id);
    expect(parseShareCode(`https://lacuna.example/#/s/${id}`)).toBe(id);
    expect(parseShareCode(`  ${id}  `)).toBe(id);
    expect(() => parseShareCode('LAC1short')).toThrow('not a Lacuna share link');
    expect(() => parseShareCode('https://lacuna.example/#/s/tooshort')).toThrow(
      'not a Lacuna share link',
    );
  });

  it('formats share link hashes and absolute URLs', () => {
    const id = 'a'.repeat(32);
    expect(shareLinkHash(id)).toBe(`/#/s/${id}`);
    expect(formatShareLink(id, 'https://lacuna.example/')).toBe(`https://lacuna.example/#/s/${id}`);
    expect(() => shareLinkHash('short')).toThrow('share link code is invalid');
  });

  it('reports an unreachable service instead of leaking fetch errors', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(mintShare(RELAY_URL, failing)).rejects.toThrow(
      'Could not reach the share link service',
    );
    const failure = await mintShare(RELAY_URL, failing).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ShareLinkError);
    expect((failure as ShareLinkError).operation).toBe('mint');

    await expect(
      getShareBytes({ relayUrl: RELAY_URL, shareId: 'a'.repeat(32), slot: 'meta', fetchImpl: failing }),
    ).rejects.toThrow('Could not reach the share link service');
  });

  it('refuses non-HTTPS relay URLs', async () => {
    const fetchImpl = vi.fn();
    await expect(mintShare('http://relay.example', fetchImpl)).rejects.toThrow(ShareLinkError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
