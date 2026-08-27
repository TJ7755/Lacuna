import { describe, expect, it } from 'vitest';
import {
  AI_PAIRING_TTL_MS,
  AI_SESSION_TTL_MS,
  EMPTY_SLOT_ETAG,
  __resetMintRateLimitForTests,
  createHandler,
} from '../src/relay.js';
import { MemoryStore } from '../src/store.js';

const ORIGIN = 'https://app.example';
const BROWSER_PUBLIC_KEY = base64Url(new Uint8Array(65).fill(1));
const TERMINAL_PUBLIC_KEY = base64Url(new Uint8Array(65).fill(2));

describe('AI relay', () => {
  it('pairs one terminal client without exposing either private key', async () => {
    let now = 1_000_000;
    const handle = createHandler(new MemoryStore(() => now), { now: () => now });

    const created = await handle(jsonRequest('/ai/sessions', 'POST', {
      browserPublicKey: BROWSER_PUBLIC_KEY,
    }));
    expect(created.status).toBe(201);
    const browser = (await created.json()) as {
      sessionId: string;
      pairingCode: string;
      browserToken: string;
      expiresAt: number;
    };
    expect(browser.sessionId).toMatch(/^[A-HJ-KM-NP-TV-Z2-9]{20}$/);
    expect(browser.pairingCode).toMatch(/^[A-HJ-KM-NP-TV-Z2-9]{4}(?:-[A-HJ-KM-NP-TV-Z2-9]{4}){4}$/);
    expect(browser.browserToken).toMatch(/^[0-9a-f]{64}$/);
    expect(browser.expiresAt).toBe(now + AI_PAIRING_TTL_MS);
    expect(JSON.stringify(browser)).not.toContain(BROWSER_PUBLIC_KEY);

    const waiting = await handle(
      authorisedRequest(`/ai/s/${browser.sessionId}/peer`, 'GET', browser.browserToken),
    );
    expect(waiting.status).toBe(404);

    now += 2_000;
    const claimed = await handle(
      jsonRequest(`/ai/s/${browser.pairingCode}/claim`, 'POST', {
        terminalPublicKey: TERMINAL_PUBLIC_KEY,
        client: { name: 'OpenCode', version: '1.2.3' },
      }),
    );
    expect(claimed.status).toBe(200);
    const terminal = (await claimed.json()) as {
      sessionId: string;
      browserPublicKey: string;
      terminalToken: string;
      expiresAt: number;
    };
    expect(terminal).toEqual({
      sessionId: browser.sessionId,
      browserPublicKey: BROWSER_PUBLIC_KEY,
      terminalToken: expect.stringMatching(/^[0-9a-f]{64}$/),
      expiresAt: now + AI_SESSION_TTL_MS,
    });

    const peer = await handle(
      authorisedRequest(`/ai/s/${browser.sessionId}/peer`, 'GET', browser.browserToken),
    );
    expect(peer.status).toBe(200);
    expect(await peer.json()).toEqual({
      terminalPublicKey: TERMINAL_PUBLIC_KEY,
      client: { name: 'OpenCode', version: '1.2.3' },
      expiresAt: terminal.expiresAt,
    });

    const secondClaim = await handle(
      jsonRequest(`/ai/s/${browser.sessionId}/claim`, 'POST', {
        terminalPublicKey: base64Url(new Uint8Array(65).fill(3)),
        client: { name: 'Other agent' },
      }),
    );
    expect(secondClaim.status).toBe(409);
  });

  it('keeps the two encrypted mailboxes behind their respective capabilities', async () => {
    const pair = await paired();
    const browserBody = new Uint8Array([1, 2, 3]);
    const terminalBody = new Uint8Array([4, 5, 6]);

    const browserPut = await pair.handle(
      mailboxPut(pair.sessionId, 'browser', pair.browserToken, EMPTY_SLOT_ETAG, browserBody),
    );
    expect(browserPut.status).toBe(204);
    const browserGeneration = browserPut.headers.get('ETag');
    expect(browserGeneration).toMatch(/^"[^"]+"$/);

    const browserDenied = await pair.handle(
      authorisedRequest(`/ai/s/${pair.sessionId}/browser`, 'GET', pair.browserToken),
    );
    expect(browserDenied.status).toBe(401);
    const browserRead = await pair.handle(
      authorisedRequest(`/ai/s/${pair.sessionId}/browser`, 'GET', pair.terminalToken),
    );
    expect(browserRead.status).toBe(200);
    expect(new Uint8Array(await browserRead.arrayBuffer())).toEqual(browserBody);

    const terminalPut = await pair.handle(
      mailboxPut(pair.sessionId, 'terminal', pair.terminalToken, EMPTY_SLOT_ETAG, terminalBody),
    );
    expect(terminalPut.status).toBe(204);
    const terminalDenied = await pair.handle(
      authorisedRequest(`/ai/s/${pair.sessionId}/terminal`, 'GET', pair.terminalToken),
    );
    expect(terminalDenied.status).toBe(401);
    const terminalRead = await pair.handle(
      authorisedRequest(`/ai/s/${pair.sessionId}/terminal`, 'GET', pair.browserToken),
    );
    expect(terminalRead.status).toBe(200);
    expect(new Uint8Array(await terminalRead.arrayBuffer())).toEqual(terminalBody);

    const stale = await pair.handle(
      mailboxPut(pair.sessionId, 'browser', pair.browserToken, EMPTY_SLOT_ETAG, browserBody),
    );
    expect(stale.status).toBe(412);
  });

  it('expires unclaimed pairing codes and lets the browser revoke a claimed session', async () => {
    let now = 10_000;
    const handle = createHandler(new MemoryStore(() => now), { now: () => now });
    const created = await handle(jsonRequest('/ai/sessions', 'POST', {
      browserPublicKey: BROWSER_PUBLIC_KEY,
    }));
    const browser = (await created.json()) as {
      sessionId: string;
      browserToken: string;
    };

    now += AI_PAIRING_TTL_MS;
    const expiredClaim = await handle(
      jsonRequest(`/ai/s/${browser.sessionId}/claim`, 'POST', {
        terminalPublicKey: TERMINAL_PUBLIC_KEY,
        client: { name: 'OpenCode' },
      }),
    );
    expect(expiredClaim.status).toBe(404);

    const pair = await paired();
    const revoked = await pair.handle(
      authorisedRequest(`/ai/s/${pair.sessionId}`, 'DELETE', pair.browserToken),
    );
    expect(revoked.status).toBe(204);
    const gone = await pair.handle(
      authorisedRequest(`/ai/s/${pair.sessionId}/peer`, 'GET', pair.browserToken),
    );
    expect(gone.status).toBe(404);
  });

  it('rate-limits public pairing-session creation', async () => {
    __resetMintRateLimitForTests();
    const handle = createHandler(new MemoryStore());
    for (let index = 0; index < 10; index += 1) {
      const response = await handle(
        jsonRequest('/ai/sessions', 'POST', { browserPublicKey: BROWSER_PUBLIC_KEY }),
      );
      expect(response.status).toBe(201);
    }
    const limited = await handle(
      jsonRequest('/ai/sessions', 'POST', { browserPublicKey: BROWSER_PUBLIC_KEY }),
    );
    expect(limited.status).toBe(429);
    __resetMintRateLimitForTests();
  });
});

async function paired() {
  const handle = createHandler(new MemoryStore());
  const created = await handle(jsonRequest('/ai/sessions', 'POST', {
    browserPublicKey: BROWSER_PUBLIC_KEY,
  }));
  const browser = (await created.json()) as {
    sessionId: string;
    pairingCode: string;
    browserToken: string;
  };
  const claimed = await handle(jsonRequest(`/ai/s/${browser.pairingCode}/claim`, 'POST', {
    terminalPublicKey: TERMINAL_PUBLIC_KEY,
    client: { name: 'OpenCode' },
  }));
  const terminal = (await claimed.json()) as { terminalToken: string };
  return { handle, ...browser, ...terminal };
}

function jsonRequest(path: string, method: string, body: unknown): Request {
  const encoded = JSON.stringify(body);
  return new Request(`http://relay.test${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(encoded)),
    },
    body: encoded,
  });
}

function authorisedRequest(path: string, method: string, token: string): Request {
  return new Request(`http://relay.test${path}`, {
    method,
    headers: { Origin: ORIGIN, Authorization: `Bearer ${token}` },
  });
}

function mailboxPut(
  sessionId: string,
  mailbox: 'browser' | 'terminal',
  token: string,
  generation: string,
  body: Uint8Array,
): Request {
  return new Request(`http://relay.test/ai/s/${sessionId}/${mailbox}`, {
    method: 'PUT',
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.byteLength),
      'If-Match': generation,
    },
    body,
  });
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}
