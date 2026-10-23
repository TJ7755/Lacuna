import { waitUntil } from '@vercel/functions';
import { loadAccessConfiguration, verifySessionToken } from '../../server/ai/access.js';
import { aiHeaders, allowedOrigin, readBoundedBody } from '../../server/ai/http.js';
import { callJevDecision, callJevAllocationBatch } from '../../server/jev/provider.js';
import { getJevUsageStore, loadJevLimit } from '../../server/jev/usage.js';
import { jevMarkRequestSchema } from '../../src/jev/apiEntry.js';

export default {
  async fetch(request: Request): Promise<Response> {
    const started = performance.now();
    let typesafeMs = 0;
    const finish = (response: Response) => {
      response.headers.set(
        'Server-Timing',
        `typesafe;dur=${typesafeMs.toFixed(1)}, total;dur=${(performance.now() - started).toFixed(1)}`,
      );
      return response;
    };
    const origin = allowedOrigin(request);
    const headers = aiHeaders(origin === false ? null : origin);
    const error = (status: number, message: string) =>
      finish(new Response(message, { status, headers }));
    if (origin === false) return error(403, 'Origin is not allowed.');
    if (request.method === 'OPTIONS') return finish(new Response(null, { status: 204, headers }));
    if (request.method !== 'POST') return error(405, 'Method not allowed.');
    const access = loadAccessConfiguration(process.env);
    const key = process.env.TYPESAFE_API_KEY?.trim();
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const limit = loadJevLimit(process.env.JEV_MONTHLY_INPUT_TOKEN_LIMIT);
    if (
      process.env.JEV_SERVICE_DISABLED === '1' ||
      !access ||
      !key ||
      !url ||
      !token ||
      limit === null
    )
      return error(503, 'Jev is unavailable.');
    if (
      !verifySessionToken(
        request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '',
        access,
      )
    )
      return error(401, 'Access code is invalid or revoked.');
    const body = await readBoundedBody(request);
    if (body === null) return error(413, 'Jev request is too large.');
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      return error(400, 'Invalid request.');
    }
    const parsed = jevMarkRequestSchema.safeParse(value);
    if (!parsed.success) return error(400, 'Invalid request.');
    let usage: ReturnType<typeof getJevUsageStore> | null = null;
    let calledAt: number | null = null;
    try {
      usage = getJevUsageStore(url, token);
      const refresh = usage.refresh();
      if (refresh) waitUntil(refresh.catch(() => {}));
      if (!usage.allowed(limit)) return error(429, 'Jev input-token ceiling reached.');
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
      calledAt = Date.now();
      const typesafeStarted = performance.now();
      let result;
      try {
        result =
          'allocations' in parsed.data
            ? await callJevAllocationBatch(parsed.data, key, signal)
            : await callJevDecision(parsed.data, key, signal);
      } finally {
        typesafeMs = performance.now() - typesafeStarted;
      }
      const response = finish(Response.json(result, { headers }));
      waitUntil(usage.record(result.inputTokens, calledAt).catch(() => {}));
      return response;
    } catch {
      const response = error(503, 'Jev is unavailable.');
      // Count failed provider calls too; their unreported token usage is unknown.
      if (usage && calledAt !== null) waitUntil(usage.record(0, calledAt).catch(() => {}));
      return response;
    }
  },
};
