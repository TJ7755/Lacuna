import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { createJevDecisionCache, decisionHash } from './cache';
it('reuses a device verdict after recreating the in-memory cache and invalidates changed content', async () => {
  const request = {
    purpose: 'typed-equivalence' as const,
    prompt: 'Cache fixture',
    expected: 'Water',
    answer: 'Water molecules',
  };
  const hash = await decisionHash(request);
  const cache = createJevDecisionCache();
  await cache.put(hash, { model: 'jev-1.14.0', value: 1, confidence: 0.98, inputTokens: 12 });
  expect(await createJevDecisionCache().get(hash)).toMatchObject({ value: 1, confidence: 0.98 });
  expect(await decisionHash({ ...request, expected: 'Oxygen' })).not.toBe(hash);
  expect(await decisionHash({ ...request, prompt: 'Different' })).not.toBe(hash);
});
