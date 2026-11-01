import { afterEach, expect, it, vi } from 'vitest';
import { createHostedTransport, hostedLimitError } from './hostedTransport';

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'electronAPI');
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0',
  });
});

it('uses the web function when an Electron browser lacks Lacuna’s preload', async () => {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 Electron/44.0.0',
  });
  const fetcher = vi.fn(async () => Response.json({ token: 'session', expiresAt: 1 }));

  await createHostedTransport(fetcher as typeof fetch).exchange('test-access-code');

  expect(fetcher).toHaveBeenCalledWith(
    '/api/ai/session',
    expect.objectContaining({ method: 'POST' }),
  );
});

it('uses the deployed service from Lacuna’s packaged Electron renderer', async () => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { isElectron: true },
  });
  const fetcher = vi.fn(async () => Response.json({ token: 'session', expiresAt: 1 }));

  await createHostedTransport(fetcher as typeof fetch).exchange('test-access-code');

  expect(fetcher).toHaveBeenCalledWith(
    'https://getlacuna.app/api/ai/session',
    expect.objectContaining({ method: 'POST' }),
  );
});

it.each([
  ['session', 'monthly-tokens', '86400', 'rate-limit', 60],
  ['marking', 'monthly-tokens', '86400', 'quota', 86400],
  ['marking', 'monthly-requests', '86400', 'quota', 86400],
  ['marking', 'global-concurrent', '45', 'rate-limit', 45],
  ['session', 'session-minute', '30', 'rate-limit', 30],
  ['marking', 'installation-day', '43200', 'quota', 43200],
  ['marking', 'installation-minute', '30', 'rate-limit', 30],
  ['marking', 'installation-concurrent', '12', 'rate-limit', 12],
  ['marking', 'installation-day', '86401', 'rate-limit', 60],
  ['session', 'installation-day', '43200', 'rate-limit', 60],
  ['session', 'session-day', '43200', 'rate-limit', 43200],
  ['marking', null, null, 'rate-limit', 60],
  ['marking', 'unknown', '86400', 'rate-limit', 60],
  ['session', 'session-minute', '86400', 'rate-limit', 60],
  ['session', 'session-day', '-1', 'rate-limit', 60],
  ['marking', 'monthly-tokens', 'not a reset', 'rate-limit', 60],
  ['marking', 'monthly-tokens', 'Infinity', 'rate-limit', 60],
  ['marking', 'monthly-tokens', '1e6', 'rate-limit', 60],
] as const)('bounds $0 throttling from $1 / $2', (source, limit, reset, kind, seconds) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
  const headers = new Headers();
  if (limit !== null) headers.set('X-Lacuna-AI-Limit', limit);
  if (reset !== null) headers.set('Retry-After', reset);
  const error = hostedLimitError(new Response('', { status: 429, headers }), source);
  expect(error.kind).toBe(kind);
  expect(error.retryAt).toBe(Date.UTC(2026, 9, 21, 10) + seconds * 1000);
});
