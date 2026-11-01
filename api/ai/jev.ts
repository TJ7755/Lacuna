import { waitUntil } from '@vercel/functions';
import {
  loadJevSigningKey,
  loadJevMaintainerIds,
  verifyJevSession,
} from '../../server/jev/access.js';
import { aiHeaders, allowedOrigin, readBoundedBody } from '../../server/ai/http.js';
import {
  callJevDecision,
  callJevAllocationBatch,
  JevProviderError,
} from '../../server/jev/provider.js';
import {
  getJevUsageStore,
  loadJevLimit,
  DEFAULT_JEV_MONTHLY_REQUEST_LIMIT,
} from '../../server/jev/usage.js';
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
    const access = loadJevSigningKey(process.env);
    const maintainers = loadJevMaintainerIds(process.env.JEV_MAINTAINER_INSTALLATION_IDS);
    const key = process.env.TYPESAFE_API_KEY?.trim();
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const limit = loadJevLimit(process.env.JEV_MONTHLY_INPUT_TOKEN_LIMIT);
    const requestLimit = loadJevLimit(
      process.env.JEV_MONTHLY_REQUEST_LIMIT,
      DEFAULT_JEV_MONTHLY_REQUEST_LIMIT,
    );
    if (
      process.env.JEV_SERVICE_DISABLED === '1' ||
      !access ||
      !key ||
      !url ||
      !token ||
      limit === null ||
      requestLimit === null ||
      maintainers === null
    )
      return error(503, 'Jev is unavailable.');
    const installationId = verifyJevSession(
      request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '',
      access,
    );
    if (!installationId) return error(401, 'Jev session has expired or is invalid.');
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
    let settle: ((inputTokens: number | null) => Promise<void>) | null = null;
    let inputTokens: number | null = null;
    let stage: 'usage' | 'provider' = 'usage';
    let providerSignal: AbortSignal | undefined;
    try {
      const admission = await getJevUsageStore(url, token).reserve(installationId, {
        monthlyTokens: limit,
        monthlyRequests: requestLimit,
        maintainer: maintainers.has(installationId),
      });
      if (!admission.allowed) {
        headers.set('X-Lacuna-AI-Limit', admission.reason);
        headers.set(
          'Retry-After',
          String(Math.max(1, Math.ceil((admission.retryAt - Date.now()) / 1000))),
        );
        return error(429, 'Jev allowance reached. You can still mark answers yourself.');
      }
      settle = admission.settle;
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
      providerSignal = signal;
      stage = 'provider';
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
      inputTokens = result.inputTokens;
      return response;
    } catch (failure) {
      console.error({
        event: 'jev-failure',
        stage,
        kind: providerSignal?.aborted
          ? 'aborted'
          : failure instanceof JevProviderError
            ? failure.kind
            : stage === 'provider'
              ? 'invalid-response'
              : 'internal',
        ...(failure instanceof JevProviderError && failure.status !== undefined
          ? { status: failure.status }
          : {}),
      });
      const response =
        stage === 'provider'
          ? error(502, 'Jev could not mark this answer.')
          : error(503, 'Jev is unavailable.');
      return response;
    } finally {
      // Admission counts failed calls too. Unknown provider usage is never presented as measured usage.
      if (settle)
        waitUntil(
          settle(inputTokens).catch(() => {
            console.error({ event: 'jev-usage-settlement-failure' });
          }),
        );
    }
  },
};
