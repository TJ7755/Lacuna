import { decodeHostedEvents, type HostedEvent, type HostedRequest } from '../hostedProtocol';
import { HOSTED_SERVICE_ORIGIN } from '../../config/origins';

export { HOSTED_SERVICE_ORIGIN } from '../../config/origins';

export const HOSTED_ACCESS_STORAGE_KEY = 'lacuna.aiHostedAccess';

export interface HostedTransport {
  exchange(credential: string, signal?: AbortSignal): Promise<{ token: string; expiresAt: number }>;
  infer(request: HostedRequest, token: string, signal: AbortSignal): AsyncGenerator<HostedEvent>;
}

export class HostedTransportError extends Error {
  constructor(
    readonly kind: 'access' | 'rate-limit' | 'quota' | 'unavailable' | 'network' | 'invalid',
    readonly retryAt: number | null = null,
  ) {
    super(
      {
        access: 'Your AI access code has expired or was revoked.',
        quota: 'AI limit reached. Try again later.',
        'rate-limit': 'Too many attempts. Try again later.',
        unavailable: 'Built-in AI is unavailable. Try again later.',
        network: 'Lacuna could not reach the AI service. Check your connection.',
        invalid: 'The AI service rejected this request.',
      }[kind],
    );
  }
}

function endpoint(path: string): string {
  return `${window.electronAPI?.isElectron === true ? HOSTED_SERVICE_ORIGIN : ''}/api/ai/${path}`;
}

/** Only the marking endpoint can report monthly exhaustion; unlabelled 429s use short backoff. */
export function hostedLimitError(
  response: Response,
  source: 'session' | 'marking',
): HostedTransportError {
  const retryAfter = response.headers.get('Retry-After') ?? '';
  const seconds = /^\d+$/.test(retryAfter) ? Number(retryAfter) : NaN;
  const limit = response.headers.get('X-Lacuna-AI-Limit');
  const monthly = source === 'marking' && limit === 'monthly-tokens';
  const maximum = monthly
    ? 31 * 86_400
    : limit === 'session-day'
      ? 86_400
      : limit === 'session-minute'
        ? 60
        : 0;
  const validReset = Number.isSafeInteger(seconds) && seconds > 0 && seconds <= maximum;
  return new HostedTransportError(
    monthly && validReset ? 'quota' : 'rate-limit',
    Date.now() + (validReset ? seconds : 60) * 1000,
  );
}

function responseError(response: Response): HostedTransportError {
  const { status } = response;
  if (status === 401) return new HostedTransportError('access');
  if (status === 429) return hostedLimitError(response, 'session');
  if (status === 400 || status === 413) return new HostedTransportError('invalid');
  return new HostedTransportError('unavailable');
}

export function createHostedTransport(
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): HostedTransport {
  return {
    async exchange(credential, signal) {
      let response: Response;
      try {
        response = await fetcher(endpoint('session'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential }),
          signal,
        });
      } catch {
        throw new HostedTransportError('network');
      }
      if (!response.ok) throw responseError(response);
      const body = (await response.json()) as { token?: unknown; expiresAt?: unknown };
      if (typeof body.token !== 'string' || typeof body.expiresAt !== 'number') {
        throw new HostedTransportError('invalid');
      }
      return { token: body.token, expiresAt: body.expiresAt };
    },
    async *infer(request, token, signal) {
      let response: Response;
      try {
        response = await fetcher(endpoint('inference'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal,
        });
      } catch {
        throw new HostedTransportError('network');
      }
      if (!response.ok) throw responseError(response);
      if (
        !response.body ||
        !response.headers.get('Content-Type')?.startsWith('application/x-ndjson')
      ) {
        throw new HostedTransportError('invalid');
      }
      try {
        yield* decodeHostedEvents(response.body);
      } catch {
        if (signal.aborted) return;
        throw new HostedTransportError('network');
      }
    },
  };
}
