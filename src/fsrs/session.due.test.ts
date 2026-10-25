import { describe, expect, it } from 'vitest';
import { MS_PER_DAY } from './params';
import { applyReview, makeEngine } from './fsrs';
import {
  makeSessionContext,
  selectNext,
  sessionComplete,
  sessionProgress,
  sessionServePool,
} from './session';
import { NOW, deck, card } from './session.testFixtures';

describe('due review sessions', () => {
  it.each([1, 2])(
    'rechecks due dates across %i units and completes below the exam target',
    (unitCount) => {
      const units = Array.from({ length: unitCount }, (_, index) => deck(`unit-${index}`, 30));
      const ctx = makeSessionContext(units, 'due');
      const cards = units.map((unit) =>
        card(unit.id, unit.id, {
          state: 2,
          stability: 0.1,
          difficulty: 5,
          reps: 5,
          lastReviewed: NOW - 10_000,
          due: NOW - 1,
        }),
      );
      const future = card('future', units[0].id, { due: NOW + MS_PER_DAY });
      const unseen = card('unseen', units[0].id);
      const pool = [...cards, future, unseen];
      expect(sessionServePool(pool, ctx, NOW).map((entry) => entry.id)).toEqual(
        cards.map((entry) => entry.id),
      );
      expect(sessionComplete(pool, ctx, NOW)).toBe(false);
      for (let index = 0; index < unitCount; index += 1) {
        const next = selectNext(pool, ctx, new Map(), NOW)!;
        expect(next.due).toBeLessThanOrEqual(NOW);
        Object.assign(
          next,
          applyReview(makeEngine(units[index].fsrsParameters), next, 2, NOW).memory,
        );
        expect(next.due).toBeGreaterThan(NOW);
        expect(sessionServePool(pool, ctx, NOW).some((entry) => entry.id === next.id)).toBe(false);
      }
      expect(sessionProgress(pool, ctx, NOW)).toBeLessThan(0.9);
      expect(sessionComplete(pool, ctx, NOW)).toBe(true);
      expect(selectNext(pool, ctx, new Map(), NOW)).toBeNull();
    },
  );

  it('waits for failed learning cards to become due and keeps suspension and burial exclusions', () => {
    const unit = deck('unit', 30);
    const ctx = makeSessionContext([unit], 'due');
    const learning = card('learning', unit.id, { state: 1, due: NOW + 60_000 });
    const pool = [
      learning,
      card('suspended', unit.id, { due: NOW, suspended: true }),
      card('buried', unit.id, { due: NOW, buriedUntil: NOW + MS_PER_DAY }),
    ];
    expect(selectNext(pool, ctx, new Map(), NOW)).toBeNull();
    expect(sessionComplete(pool, ctx, NOW)).toBe(true);
    expect(selectNext(pool, ctx, new Map(), NOW + 60_000)?.id).toBe(learning.id);
    expect(sessionComplete(pool, ctx, NOW + 60_000)).toBe(false);
  });
});
