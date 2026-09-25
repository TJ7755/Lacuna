import { afterEach, expect, it, vi } from 'vitest';
import { createHostedTransport, HOSTED_SERVICE_ORIGIN } from './hostedTransport';

afterEach(() => {
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

  expect(fetcher).toHaveBeenCalledWith('/api/ai/session', expect.objectContaining({ method: 'POST' }));
});

it('uses the deployed service from Lacuna’s packaged Electron renderer', async () => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { isElectron: true },
  });
  const fetcher = vi.fn(async () => Response.json({ token: 'session', expiresAt: 1 }));

  await createHostedTransport(fetcher as typeof fetch).exchange('test-access-code');

  expect(fetcher).toHaveBeenCalledWith(`${HOSTED_SERVICE_ORIGIN}/api/ai/session`,
    expect.objectContaining({ method: 'POST' }));
});
