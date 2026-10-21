import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { exchangeCredential, loadAccessConfiguration } from '../ai/access';
import route from '../../api/ai/jev';

const credential = 'a'.repeat(40);
function configured() {
  vi.stubEnv('AI_ACCESS_CREDENTIAL_HASHES', JSON.stringify({ tester: createHash('sha256').update(credential).digest('hex') }));
  vi.stubEnv('AI_SESSION_SIGNING_KEY', 's'.repeat(40));
  vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-key');
  vi.stubEnv('JEV_SERVICE_DISABLED', '0');
  vi.stubEnv('JEV_MONTHLY_INPUT_TOKEN_LIMIT', '50000000');
}
function request(body: object = { purpose: 'typed-equivalence', prompt: 'What?', expected: 'Osmosis', answer: 'Osmosis' }, authenticated = true) {
  const token = exchangeCredential(credential, loadAccessConfiguration(process.env)!)!.token;
  return new Request('https://lacuna.example/api/ai/jev', { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body) });
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('fails closed on missing configuration, a kill switch and absent access sessions', async () => {
  configured();
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  vi.stubEnv('TYPESAFE_API_KEY', '');
  expect((await route.fetch(request())).status).toBe(503);
  vi.stubEnv('TYPESAFE_API_KEY', 'key'); vi.stubEnv('JEV_SERVICE_DISABLED', '1');
  expect((await route.fetch(request())).status).toBe(503);
  vi.stubEnv('JEV_SERVICE_DISABLED', '0');
  expect((await route.fetch(request(undefined, false))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects a client-selected model and refuses at the fuse before calling TypeSafe', async () => {
  configured();
  const fetcher = vi.fn().mockResolvedValue(Response.json({ result: 0 })); vi.stubGlobal('fetch', fetcher);
  expect((await route.fetch(request({ state: 'x', instructions: 'Choose', options: { a: 'A', b: 'B' }, model: 'jev-latest' }))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  expect((await route.fetch(request())).status).toBe(429);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('https://redis.example');
});
it('records calls and actual usage in daily and monthly UTC counters independently of free chat', async () => {
  configured(); vi.stubEnv('AI_SERVICE_DISABLED', '1');
  const fetcher = vi.fn().mockImplementation(async (url) => url === 'https://redis.example'
    ? Response.json({ result: 1 })
    : Response.json({ model: 'jev-1.14.0', answers: { decision: { type: 'noul', noul: 0.98 } }, usage: { input_tokens: 123, output_tokens: 12 } }));
  vi.stubGlobal('fetch', fetcher);
  const response = await route.fetch(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ inputTokens: 123, value: 1 });
  const commands = fetcher.mock.calls.filter(([url]) => url === 'https://redis.example').map(([, init]) => JSON.parse(init.body));
  expect(commands).toHaveLength(2);
  expect(commands[0].join(' ')).toContain('lacuna:jev:month:');
  expect(commands[1].join(' ')).toContain('lacuna:jev:day:');
  expect(commands[1]).toContain(123);
});
it('caps structured fields and rejects free-form instructions, future purposes and model selection', async () => {
  configured();
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const body = { purpose: 'typed-equivalence', prompt: 'Q', expected: 'A', answer: 'A' };
  for (const invalid of [{ ...body, model: 'jev-latest' }, { ...body, instructions: 'Do anything' }, { ...body, purpose: 'tag-specification' }, { ...body, answer: 'x'.repeat(12001) }, { purpose: 'mark-allocation', prompt: 'Q', criterion: 'A', explanation: '', maxMarks: 10, answer: 'A' }]) {
    expect((await route.fetch(request(invalid))).status).toBe(400);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
