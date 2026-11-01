import { z } from 'zod';
import { parseInsightEnvelope, INSIGHT_MAX_ENVELOPE_BYTES } from '../insights/insightsProtocol.js';

export const relayLimits = {
  channel: 25 * 1024 * 1024,
  sharePayload: 4 * 1024 * 1024,
  shareMeta: 8192,
  shareCreate: 128,
  aiJson: 4096,
  aiMailbox: 1024 * 1024,
  insight: INSIGHT_MAX_ENVELOPE_BYTES,
} as const;
export const relayIdSchema = z.string().regex(/^[0-9a-f]{32}$/);
export const relayTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const relayErrorSchema = z.object({ error: z.string().min(1) }).strict();
const empty = z.null();
const bytes = z.instanceof(Uint8Array);
const publicKey = z.string().regex(/^[A-Za-z0-9_-]{80,100}$/);
const client = z
  .object({
    name: z.string().trim().min(1).max(100),
    version: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
const timestamp = z.number().finite().nonnegative();
const sessionId = z.string().regex(/^[A-HJ-KM-NP-TV-Z2-9]{20}$/);
const envelope = z.unknown().transform((value, ctx) => {
  try {
    return parseInsightEnvelope(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid insight envelope' });
    return z.NEVER;
  }
});
const page = z
  .object({
    v: z.literal(2),
    envelopes: z.array(z.object({ slotId: relayIdSchema, envelope }).strict()).max(16),
    cursor: z.string().min(1).max(2048).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.envelopes.map((row) => row.slotId)).size !== value.envelopes.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate insights slot' });
  });
const errors = {
  400: relayErrorSchema,
  401: relayErrorSchema,
  404: relayErrorSchema,
  405: relayErrorSchema,
  409: relayErrorSchema,
  410: relayErrorSchema,
  411: relayErrorSchema,
  412: relayErrorSchema,
  413: relayErrorSchema,
  428: relayErrorSchema,
  429: relayErrorSchema,
  500: relayErrorSchema,
  503: relayErrorSchema,
};
export const relayRequestHeadersSchema = z
  .object({
    authorization: z.string().optional(),
    'content-length': z
      .string()
      .regex(/^[0-9]+$/)
      .optional(),
    'content-type': z.string().optional(),
    'if-match': z.string().min(1).optional(),
    'x-lacuna-pairing-code': z.string().optional(),
    'x-insights-revision': z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .optional(),
  })
  .passthrough();
export const relayResponseHeadersSchema = z
  .object({
    etag: z.string().min(1).optional(),
    'x-lacuna-generation': z.string().min(1).optional(),
    'content-type': z.string().optional(),
  })
  .passthrough();
function route<
  const P extends string,
  const K extends string,
  S extends z.ZodType,
  const Status extends number = 200,
  R extends z.ZodType = typeof empty,
>(
  path: P,
  method: string,
  kind: K,
  response: S,
  status: Status = 200 as Status,
  request: R = empty as unknown as R,
  maxBytes = 0,
) {
  return {
    requestHeaders: relayRequestHeadersSchema,
    responseHeaders: relayResponseHeadersSchema,
    path,
    method,
    kind,
    request,
    maxBytes,
    responses: { ...errors, [status]: response } as typeof errors & Record<Status, S>,
  };
}
const mintChannel = z.object({ channelId: relayIdSchema, writeToken: relayTokenSchema }).strict();
const mintShare = z.object({ shareId: relayIdSchema, writeToken: relayTokenSchema }).strict();
const receipt = z.object({ generation: z.string().min(1) }).strict();
const code = z.object({ code: z.string().regex(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/) }).strict();
export const relayRoutes = {
  channelCreate: route('/channel', 'POST', 'channel', mintChannel, 201),
  channelDelete: route('/c/:id', 'DELETE', 'item', empty, 204),
  channelRead: route('/c/:id/:slot', 'GET', 'slot', bytes),
  channelWrite: route('/c/:id/:slot', 'PUT', 'slot', empty, 204, bytes, relayLimits.channel),
  shareCreate: route(
    '/shares',
    'POST',
    'share-collection',
    mintShare,
    201,
    z.object({ sourceShareId: relayIdSchema }).strict().optional(),
    relayLimits.shareCreate,
  ),
  shareDelete: route('/shares/:id', 'DELETE', 'share-item', empty, 204),
  shareVerify: {
    ...route('/shares/:id', 'HEAD', 'share-item', empty, 204),
    responses: { ...errors, 204: empty, 401: empty, 404: empty, 410: empty },
  },
  shareRead: route('/shares/:id/:slot', 'GET', 'share-slot', bytes),
  shareWrite: route(
    '/shares/:id/:slot',
    'PUT',
    'share-slot',
    empty,
    204,
    bytes,
    relayLimits.sharePayload,
  ),
  classCodeCreate: {
    ...route('/shares/:id/class-code', 'POST', 'share-class-code', code, 201),
    responses: { ...errors, 200: code, 201: code },
  },
  classCodeLookup: route(
    '/class-codes/:code',
    'GET',
    'class-code',
    z.object({ shareId: relayIdSchema }).strict(),
  ),
  aiCreate: route(
    '/ai/sessions',
    'POST',
    'ai-session-collection',
    z
      .object({
        sessionId,
        pairingCode: z.string(),
        browserToken: relayTokenSchema,
        expiresAt: timestamp,
      })
      .strict(),
    201,
    z.object({ browserPublicKey: publicKey }).strict(),
    relayLimits.aiJson,
  ),
  aiClaim: route(
    '/ai/claim',
    'POST',
    'ai-claim',
    z
      .object({
        sessionId,
        browserPublicKey: publicKey,
        terminalToken: relayTokenSchema,
        expiresAt: timestamp,
      })
      .strict(),
    200,
    z.object({ terminalPublicKey: publicKey, client }).strict(),
    relayLimits.aiJson,
  ),
  aiPeer: route(
    '/ai/s/:id/peer',
    'GET',
    'ai-peer',
    z.object({ terminalPublicKey: publicKey, client, expiresAt: timestamp }).strict(),
  ),
  aiRead: route('/ai/s/:id/:mailbox', 'GET', 'ai-mailbox', z.union([bytes, receipt])),
  aiWrite: route(
    '/ai/s/:id/:mailbox',
    'PUT',
    'ai-mailbox',
    receipt,
    200,
    bytes,
    relayLimits.aiMailbox,
  ),
  aiDelete: route('/ai/s/:id', 'DELETE', 'ai-session', empty, 204),
  insightRead: route('/insights/:id/:day', 'GET', 'insight', page),
  insightWrite: {
    ...route(
      '/insights/:id/:day/:slotId',
      'PUT',
      'insight',
      empty,
      204,
      envelope,
      relayLimits.insight,
    ),
    responses: { ...errors, 204: empty, 409: empty },
  },
  maintenance: route(
    '/ai/maintenance',
    'GET',
    'ai-maintenance',
    z.record(z.string(), z.number().int().nonnegative()),
  ),
} as const;
export type RelayEndpoint = keyof typeof relayRoutes;
export function matchRelayRoute(url: string, method?: string) {
  const parsed = new URL(url, 'http://relay.invalid');
  const pathname =
    parsed.pathname === '/api'
      ? (parsed.searchParams.get('__path') ?? parsed.pathname)
      : parsed.pathname;
  for (const endpoint of Object.keys(relayRoutes) as RelayEndpoint[]) {
    const definition = relayRoutes[endpoint];
    if (method && definition.method !== method) continue;
    const names: string[] = [];
    const pattern = definition.path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
      names.push(name);
      return '([^/]+)';
    });
    const match = new RegExp(`^${pattern}$`).exec(pathname);
    if (!match) continue;
    const params: Record<string, string> = {};
    for (let i = 0; i < names.length; i++) params[names[i]!] = match[i + 1]!;
    if (definition.kind === 'ai-mailbox' && !['browser', 'terminal'].includes(params.mailbox!))
      continue;
    if (definition.kind === 'slot' && !['state', 'keybag'].includes(params.slot!)) continue;
    if (definition.kind === 'share-slot' && !['payload', 'meta', 'teacher'].includes(params.slot!))
      continue;
    return { endpoint, definition, params };
  }
  return null;
}
export function relayResponseSchema(
  endpoint: RelayEndpoint,
  status: number,
): z.ZodType | undefined {
  return (relayRoutes[endpoint].responses as Record<number, z.ZodType>)[status];
}
export function createRelayClient(baseUrl: string, fetchImpl: typeof fetch = globalThis.fetch) {
  const fetcher = fetchImpl.bind(globalThis);
  return {
    async request<K extends RelayEndpoint>(
      endpoint: K,
      options: Omit<RequestInit, 'method'> & {
        params?: Record<string, string>;
        query?: Record<string, string>;
        json?: RelayRequestBody<K>;
      } = {},
    ) {
      const definition = relayRoutes[endpoint];
      const { params = {}, query = {}, json, ...init } = options;
      if (json !== undefined) {
        definition.request.parse(json);
        init.body = JSON.stringify(json);
      }
      const path = definition.path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
        const value = params[name];
        if (value === undefined) throw new Error(`Missing relay parameter ${name}`);
        return encodeURIComponent(value);
      });
      if (typeof init.body === 'string' && definition.maxBytes > 0 && definition.request !== bytes)
        definition.request.parse(JSON.parse(init.body));
      const response = await fetcher(
        `${baseUrl.replace(/\/+$/, '')}${path}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`,
        { ...init, method: definition.method },
      );
      return response;
    },
  };
}

export type RelayRequestBody<K extends RelayEndpoint> = z.input<(typeof relayRoutes)[K]['request']>;
export type RelayResponseBody<K extends RelayEndpoint> = z.output<
  (typeof relayRoutes)[K]['responses'][keyof (typeof relayRoutes)[K]['responses']] & z.ZodType
>;
export function parseRelayResponse<K extends RelayEndpoint>(
  endpoint: K,
  status: number,
  value: unknown,
): RelayResponseBody<K> {
  const schema = relayResponseSchema(endpoint, status);
  if (!schema) throw new Error(`Unexpected relay status ${status}`);
  return schema.parse(value) as RelayResponseBody<K>;
}

export function matchRelayInvalidSlot(url: string): 'slot-invalid' | 'share-slot-invalid' | null {
  const parsed = new URL(url, 'http://relay.invalid');
  const path =
    parsed.pathname === '/api'
      ? (parsed.searchParams.get('__path') ?? parsed.pathname)
      : parsed.pathname;
  if (/^\/c\/[^/]+\/[^/]+$/.test(path) && !matchRelayRoute(url)) return 'slot-invalid';
  if (/^\/shares\/[^/]+\/[^/]+$/.test(path) && !matchRelayRoute(url)) return 'share-slot-invalid';
  return null;
}
