import { describe, expect, it } from 'vitest';
import { AI_ACCEPTANCE_SCENARIOS } from './acceptanceFixtures';

describe('AI acceptance fixtures', () => {
  it('provides one stable fixture for each agreed browser scenario', () => {
    expect(AI_ACCEPTANCE_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'conversation',
      'reload-recovery',
      'content-actions',
      'misconception-first',
      'cooperative-stop',
      'sync-and-replace',
    ]);
    expect(new Set(AI_ACCEPTANCE_SCENARIOS.map((scenario) => scenario.id)).size).toBe(6);
    expect(AI_ACCEPTANCE_SCENARIOS.every((scenario) => scenario.assertions.length > 0)).toBe(true);
  });
});
