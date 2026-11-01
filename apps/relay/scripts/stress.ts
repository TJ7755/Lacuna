import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHandler, EMPTY_SLOT_ETAG, MAX_BODY_BYTES } from '../src/relay.js';
import { MemoryStore } from '../src/store.js';

// Deliberately no endpoint option: this harness cannot send traffic to a deployed relay.
const concurrency = integer('STRESS_CONCURRENCY', 8, 1, 128);
const iterations = integer('STRESS_ITERATIONS', 20, 1, 10000);
const payloadBytes = integer('STRESS_PAYLOAD_BYTES', 65536, 1, MAX_BODY_BYTES);
const store = new MemoryStore();
const handle = createHandler(store);
const secret = 'local-stress-mint-secret';
process.env.RELAY_MINT_SECRET = secret;
const samples = new Map<
  string,
  { milliseconds: number[]; statuses: Record<number, number>; errors: number }
>();
let address = 0;

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  assert(
    Number.isInteger(value) && value >= min && value <= max,
    `${name}: expected ${min}..${max}`,
  );
  return value;
}

async function request(
  name: string,
  path: string,
  method = 'GET',
  body?: RequestInit['body'],
  headers: Record<string, string> = {},
  expected = [200],
) {
  const started = performance.now();
  const response = await handle(
    new Request(`http://relay.local${path}`, {
      method,
      body,
      headers: { Origin: 'https://getlacuna.app', ...headers },
    }),
  );
  // Include body delivery in latency, rather than timing headers alone.
  const bytes = await response.arrayBuffer();
  const sample = samples.get(name) ?? { milliseconds: [], statuses: {}, errors: 0 };
  sample.milliseconds.push(performance.now() - started);
  sample.statuses[response.status] = (sample.statuses[response.status] ?? 0) + 1;
  if (!expected.includes(response.status)) sample.errors++;
  samples.set(name, sample);
  assert(
    expected.includes(response.status),
    `${name}: unexpected HTTP ${response.status}: ${new TextDecoder().decode(bytes)}`,
  );
  return {
    response,
    bytes,
    json: () => JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>,
  };
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = { 'Content-Type': 'application/json' };
async function mint(path: string) {
  return (await request('mint', path, 'POST', undefined, auth(secret), [201])).json();
}
async function worker() {
  const clientAddress = `198.18.${Math.floor(address / 250)}.${++address % 250}`;
  const clientHeaders = { 'x-vercel-forwarded-for': clientAddress };
  const channel = await mint('/channel');
  const share = await mint('/shares');
  const channelPath = `/c/${channel.channelId}/state`;
  const sharePath = `/shares/${share.shareId}`;
  const payload = new Uint8Array(payloadBytes).fill(47);
  let etag = EMPTY_SLOT_ETAG;
  await request(
    'share-teacher',
    `${sharePath}/teacher`,
    'PUT',
    new Uint8Array(65).fill(1),
    {
      ...auth(share.writeToken),
      'Content-Length': '65',
      'If-Match': EMPTY_SLOT_ETAG,
    },
    [204],
  );
  const code = (
    await request(
      'class-code-create',
      `${sharePath}/class-code`,
      'POST',
      undefined,
      auth(share.writeToken),
      [201, 200],
    )
  ).json().code;
  const ai = (
    await request(
      'ai-create',
      '/ai/sessions',
      'POST',
      JSON.stringify({ browserPublicKey: Buffer.alloc(65, 1).toString('base64url') }),
      {
        ...jsonHeaders,
        ...clientHeaders,
      },
      [201],
    )
  ).json();
  const claimed = await request(
    'ai-claim',
    '/ai/claim',
    'POST',
    JSON.stringify({
      terminalPublicKey: Buffer.alloc(65, 2).toString('base64url'),
      client: { name: 'Stress harness' },
    }),
    {
      ...jsonHeaders,
      'X-Lacuna-Pairing-Code': ai.pairingCode,
    },
  );
  const terminal = claimed.json();
  let mailboxEtag = EMPTY_SLOT_ETAG;
  await request(
    'share-write',
    `${sharePath}/payload`,
    'PUT',
    payload,
    {
      ...auth(share.writeToken),
      'Content-Length': String(payload.length),
      'If-Match': EMPTY_SLOT_ETAG,
    },
    [204],
  );
  for (let i = 0; i < iterations; i++) {
    const written = await request(
      'sync-write',
      channelPath,
      'PUT',
      payload,
      { ...auth(channel.writeToken), 'Content-Length': String(payload.length), 'If-Match': etag },
      [204],
    );
    etag = written.response.headers.get('ETag')!;
    const read = await request('sync-read', channelPath);
    assert.equal(read.bytes.byteLength, payload.length);
    await request('class-code-lookup', `/class-codes/${code}`, 'GET', undefined, clientHeaders);
    await request('share-read', `${sharePath}/payload`);
    const message = await request(
      'ai-mailbox-write',
      `/ai/s/${ai.sessionId}/browser`,
      'PUT',
      new Uint8Array(1024).fill(7),
      {
        ...auth(ai.browserToken),
        'Content-Type': 'application/octet-stream',
        'If-Match': mailboxEtag,
      },
    );
    mailboxEtag = message.response.headers.get('ETag')!;
    await request(
      'ai-mailbox-read',
      `/ai/s/${ai.sessionId}/browser`,
      'GET',
      undefined,
      auth(terminal.terminalToken),
    );
    await request('ai-poll', `/ai/s/${ai.sessionId}/peer`, 'GET', undefined, auth(ai.browserToken));
  }
  return { channelPath, token: channel.writeToken, etag };
}

const started = performance.now();
const channels = await Promise.all(Array.from({ length: concurrency }, worker));
const target = channels[0];
const contenders = Math.max(2, concurrency);
const results = await Promise.all(
  Array.from({ length: contenders }, () =>
    request(
      'cas-contention',
      target.channelPath,
      'PUT',
      new Uint8Array([1]),
      {
        ...auth(target.token),
        'Content-Length': '1',
        'If-Match': target.etag,
      },
      [204, 409, 412],
    ),
  ),
);
assert.equal(
  results.filter(({ response }) => response.status === 204).length,
  1,
  'exactly one CAS contender must win',
);
await request(
  'payload-limit',
  target.channelPath,
  'PUT',
  'x',
  { ...auth(target.token), 'Content-Length': String(MAX_BODY_BYTES + 1), 'If-Match': target.etag },
  [413],
);
for (let i = 0; i < 11; i++) {
  await request(
    'rate-limit',
    '/channel',
    'POST',
    undefined,
    { 'x-vercel-forwarded-for': '203.0.113.99' },
    [i < 10 ? 201 : 429],
  );
}
const elapsedMs = performance.now() - started;
const metrics = Object.fromEntries(
  [...samples].map(([name, sample]) => {
    const sorted = sample.milliseconds.sort((a, b) => a - b);
    const percentile = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
    return [
      name,
      {
        requests: sorted.length,
        statuses: sample.statuses,
        errors: sample.errors,
        errorRate: sample.errors / sorted.length,
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
      },
    ];
  }),
);
const report = {
  adapter: 'MemoryStore',
  transport: 'in-process Request/Response',
  concurrency,
  iterations,
  payloadBytes,
  elapsedMs,
  requestsPerSecond:
    [...samples.values()].reduce((sum, sample) => sum + sample.milliseconds.length, 0) /
    (elapsedMs / 1000),
  metrics,
};
await mkdir('artifacts/stress', { recursive: true });
await writeFile('artifacts/stress/relay.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
