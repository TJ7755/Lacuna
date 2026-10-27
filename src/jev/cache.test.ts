import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { createJevDecisionCache, decisionHash } from './cache';
import type { JevDecisionRequest, JevDecisionResult } from './protocol';

it('caches diagnostic evidence when marking abstains and separates it from mark-only requests', async () => {
  const request: JevDecisionRequest = {
    purpose: 'mark-allocation',
    prompt: 'Explain enzyme activity',
    criterion: 'A causal link',
    explanation: '',
    maxMarks: 1,
    answer: 'Facts without a connection',
    diagnostic: {
      taxonomyId: 'science-explanations',
      taxonomyVersion: 1,
      techniqueIds: ['causal-link'],
    },
  };
  const result: JevDecisionResult = {
    model: 'jev-1.14.0',
    value: null,
    confidence: 0.5,
    inputTokens: 0,
    diagnosis: {
      taxonomyId: 'science-explanations',
      taxonomyVersion: 1,
      decisions: [
        { categoryId: 'knowledge', outcome: 'no-gap', confidence: 0.99 },
        { categoryId: 'application', outcome: 'insufficient-evidence', confidence: 0.5 },
        { categoryId: 'causal-link', outcome: 'gap', confidence: 0.99 },
      ],
    },
  };
  const hash = await decisionHash(request);
  await createJevDecisionCache().put(hash, result);
  expect(await createJevDecisionCache().get(hash)).toEqual(result);
  const { diagnostic: _diagnostic, ...markOnly } = request;
  expect(await decisionHash(markOnly)).not.toBe(hash);
  expect(await decisionHash({ ...request, criterion: 'A changed causal requirement' })).not.toBe(
    hash,
  );
});
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
it('retains successful unsure feedback across cache instances', async () => {
  const hash = await decisionHash({
    purpose: 'typed-equivalence',
    prompt: 'Feedback cache fixture',
    expected: 'Water and glucose',
    answer: 'Water',
  });
  const feedback = {
    kind: 'partial' as const,
    parts: [
      { start: 0, end: 5, covered: true },
      { start: 10, end: 17, covered: null },
    ],
  };
  await createJevDecisionCache().put(hash, {
    model: 'jev-1.14.0',
    value: null,
    confidence: 0.5,
    inputTokens: 12,
    feedback,
  });
  expect(await createJevDecisionCache().get(hash)).toMatchObject({ value: null, feedback });
});
