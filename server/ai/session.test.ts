import { afterEach, expect, it, vi } from 'vitest';
import session from '../../api/ai/session';
import { jevInstallationId, verifyJevSession } from '../jev/access';

const key = 'k'.repeat(32);
const credential = 'a'.repeat(64);
const request = (body: unknown = { credential }, headers: Record<string, string> = {}) =>
  new Request('https://getlacuna.app/api/ai/session', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('issues public sessions without invitations or IP-based admission', async () => {
  vi.stubEnv('AI_SESSION_SIGNING_KEY', key);
  vi.stubEnv('AI_ACCESS_CREDENTIAL_HASHES', '');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const address of ['203.0.113.7', '203.0.113.7', '203.0.113.8']) {
    const response = await session.fetch(
      request(undefined, { 'x-vercel-forwarded-for': address, Origin: 'app://.' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(verifyJevSession((await response.json()).token, key)).toBe(
      jevInstallationId(credential),
    );
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects invalid credentials and stops new sessions at either service switch', async () => {
  vi.stubEnv('AI_SESSION_SIGNING_KEY', key);
  for (const body of [
    null,
    {},
    { credential: 'old-invitation-code' },
    { credential: 'A'.repeat(64) },
  ])
    expect((await session.fetch(request(body))).status).toBe(400);
  for (const variable of ['JEV_SERVICE_DISABLED', 'AI_SERVICE_DISABLED']) {
    vi.stubEnv(variable, '1');
    expect((await session.fetch(request())).status).toBe(503);
    vi.stubEnv(variable, '0');
  }
  vi.stubEnv('AI_SESSION_SIGNING_KEY', '');
  expect((await session.fetch(request())).status).toBe(503);
});
