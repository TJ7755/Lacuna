import { decodeHostedEvents, type HostedEvent, type HostedRequest } from '../hostedProtocol';
import { isElectronRuntime } from '../../electron/runtime';

export const HOSTED_ACCESS_STORAGE_KEY = 'lacuna.aiHostedAccess';
export const HOSTED_SERVICE_ORIGIN = 'https://lacuna-beta-one.vercel.app';

export interface HostedTransport {
  exchange(credential: string, signal?: AbortSignal): Promise<{ token: string; expiresAt: number }>;
  infer(request: HostedRequest, token: string, signal: AbortSignal): AsyncGenerator<HostedEvent>;
}

export class HostedTransportError extends Error {
  constructor(readonly kind: 'access' | 'quota' | 'unavailable' | 'network' | 'invalid') {
    super({
      access: 'Your AI access code has expired or was revoked.',
      quota: 'AI limit reached. Try again later.',
      unavailable: 'Built-in AI is unavailable. Try again later.',
      network: 'Lacuna could not reach the AI service. Check your connection.',
      invalid: 'The AI service rejected this request.',
    }[kind]);
  }
}

function endpoint(path: string): string {
  return `${isElectronRuntime() ? HOSTED_SERVICE_ORIGIN : ''}/api/ai/${path}`;
}

function responseError(status: number): HostedTransportError {
  if (status === 401) return new HostedTransportError('access');
  if (status === 429) return new HostedTransportError('quota');
  if (status === 400 || status === 413) return new HostedTransportError('invalid');
  return new HostedTransportError('unavailable');
}

export function createHostedTransport(fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): HostedTransport {
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
      if (!response.ok) throw responseError(response.status);
      const body = await response.json() as { token?: unknown; expiresAt?: unknown };
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
      if (!response.ok) throw responseError(response.status);
      if (!response.body || !response.headers.get('Content-Type')?.startsWith('application/x-ndjson')) {
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
