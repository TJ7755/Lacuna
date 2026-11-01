import { expect, it, vi } from 'vitest';
import inference from '../../api/ai/inference';
import { exchangeCredential } from './access';
import { createHash } from 'node:crypto';

it('returns Gone for an authenticated legacy chat without contacting any provider or store', async () => {
  const credential = 'c'.repeat(40);
  const session = exchangeCredential(credential, {
    credentialHashes: { tester: createHash('sha256').update(credential).digest('hex') },
    signingKey: 's'.repeat(40),
  });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  try {
    const handler: { fetch(request: Request): Promise<Response> } = inference;
    const response = await handler.fetch(
      new Request('https://getlacuna.app/api/ai/inference', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session!.token}` },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Old chat' }] }),
      }),
    );
    expect(response.status).toBe(410);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
