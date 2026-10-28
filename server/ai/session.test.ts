import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import session from '../../api/ai/session';

const credential = 'c'.repeat(40);

function exchange(): Promise<Response> {
  return session.fetch(
    new Request('https://getlacuna.app/api/ai/session', {
      method: 'POST',
      headers: { 'x-vercel-forwarded-for': '203.0.113.7' },
      body: JSON.stringify({ credential }),
    }),
  );
}

describe('access-code session exchange', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    { granted: 0, limit: 'session-minute', seconds: '30' },
    { granted: -1, limit: 'session-day', seconds: '43170' },
  ])(
    'reports the actual $limit reset to web and packaged clients',
    async ({ granted, limit, seconds }) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-21T12:00:30Z'));
      vi.stubEnv(
        'AI_ACCESS_CREDENTIAL_HASHES',
        JSON.stringify({
          learner_1: createHash('sha256').update(credential).digest('hex'),
        }),
      );
      vi.stubEnv('AI_SESSION_SIGNING_KEY', 'k'.repeat(32));
      vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://quota.example');
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'server-secret');
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ result: granted })),
      );
      const response = await session.fetch(
        new Request('https://getlacuna.app/api/ai/session', {
          method: 'POST',
          headers: { Origin: 'app://.', 'x-vercel-forwarded-for': '203.0.113.7' },
          body: JSON.stringify({ credential }),
        }),
      );
      expect(response.status).toBe(429);
      expect(response.headers.get('X-Lacuna-AI-Limit')).toBe(limit);
      expect(response.headers.get('Retry-After')).toBe(seconds);
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe(
        'Retry-After, X-Lacuna-AI-Limit',
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ result: 1 })),
      );
      expect((await exchange()).status).toBe(200);
    },
  );
});
