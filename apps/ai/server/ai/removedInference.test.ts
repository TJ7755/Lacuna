import { afterEach, expect, it, vi } from 'vitest';
import inference from '../../api/ai/inference';
import { createJevSession, jevInstallationId } from '../jev/access';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  'returns Gone without forwarding chat content (authenticated: %s)',
  async (authenticated) => {
    const key = 's'.repeat(40);
    vi.stubEnv('AI_SESSION_SIGNING_KEY', key);
    const session = createJevSession(jevInstallationId('a'.repeat(64))!, key);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const handler: { fetch(request: Request): Promise<Response> } = inference;
    const response = await handler.fetch(
      new Request('https://getlacuna.app/api/ai/inference', {
        method: 'POST',
        headers: authenticated ? { Authorization: `Bearer ${session.token}` } : {},
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Old chat' }] }),
      }),
    );
    expect(response.status).toBe(410);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetcher).not.toHaveBeenCalled();
  },
);
