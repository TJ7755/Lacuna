import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import session from '../../api/ai/session';

const credential = 'c'.repeat(40);

function exchange(): Promise<Response> {
  return session.fetch(new Request('https://getlacuna.app/api/ai/session', {
    method: 'POST',
    headers: { 'x-vercel-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ credential }),
  }));
}

describe('access-code session exchange', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('refuses further exchanges from an address once its attempts run out', async () => {
    vi.stubEnv('AI_ACCESS_CREDENTIAL_HASHES', JSON.stringify({
      learner_1: createHash('sha256').update(credential).digest('hex'),
    }));
    vi.stubEnv('AI_SESSION_SIGNING_KEY', 'k'.repeat(32));
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://quota.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'server-secret');
    let granted = 1;
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ result: granted })));

    expect((await exchange()).status).toBe(200);
    granted = 0;
    expect((await exchange()).status).toBe(429);
  });
});
