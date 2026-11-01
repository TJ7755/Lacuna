import { describe, expect, it } from 'vitest';
import { card, course, NOW } from '../../fsrs/session.testFixtures';
import { makeSessionContext } from '../../fsrs/session';
import { createRevisionSessionState } from '../../course/revisionSession';
import type { SessionSummary } from '../../course/sessionSummary';
import {
  snapshotSession,
  transitionSession,
  transitionCompletion,
  transitionResponseTimer,
  type SessionState,
} from './sessionMachine';

// Seeded bounded traces follow mergeSnapshots.properties.test.ts: no new test runtime.
const SEEDS = [1, 7, 42, 101, 256, 1024, 65537, 0x12345678, 0x622dc87f, 0xdeadbeef];
function randomIndex(seed: number) {
  let state = seed >>> 0;
  return (limit: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % limit;
  };
}
function initial(size: number): SessionState {
  const cards = Array.from({ length: size }, (_, id) => card(`c${id}`, 'unit'));
  const outcomes = new Map();
  return {
    cards,
    cardIds: cards.map((card) => card.id),
    outcomes,
    events: [],
    cooldowns: new Map(),
    revision: createRevisionSessionState(),
    simple: { queue: cards, mastered: new Set(), wrong: new Set(), outcomes },
  };
}
const selection = {
  simple: true,
  context: null,
  now: NOW,
  revisionPlan: null,
  windowStartedAt: 0,
  performance: new Map(),
};

describe('session machine operation sequences', () => {
  it('serves current content after answering another card and undoing', () => {
    let state = initial(2);
    const before = snapshotSession(state);
    const [answered, other] = state.cards;
    state = transitionSession(state, {
      type: 'simple-recorded',
      card: answered,
      event: {
        cardId: answered.id,
        grade: 3,
        correct: true,
        responseTimeSec: 2,
        distracted: false,
      },
    }).state;
    const edited = { ...other, front: 'Updated question' };
    state = transitionSession(state, { type: 'replace-card', card: edited }).state;
    state = transitionSession(state, { type: 'restore', snapshot: before, card: answered }).state;
    state = transitionSession(state, {
      type: 'simple-recorded',
      card: answered,
      event: {
        cardId: answered.id,
        grade: 3,
        correct: true,
        responseTimeSec: 2,
        distracted: false,
      },
    }).state;
    const next = transitionSession(state, { type: 'next', selection });
    expect(next.effects).toContainEqual({
      type: 'present-card',
      card: edited,
      invalidateProgress: false,
    });
  });

  it.each(SEEDS)(
    'conserves cards, outcomes and undo through random answers and recitations (seed %i)',
    (seed) => {
      const pick = randomIndex(seed);
      let state = initial(3 + pick(9));
      const inventory = [...state.cardIds].sort();
      const expectedMastered = new Set<string>();
      const expectedOutcomes = new Map<string, 'correct' | 'wrong'>();
      const trace: string[] = [];
      let answered = 0;
      for (let step = 0; step < 100; step++) {
        const before = snapshotSession(state);
        const untouched = structuredClone(state);
        const candidate = state.simple.queue[pick(state.simple.queue.length)];
        const correct = pick(2) === 0;
        const recitation = pick(3) === 0;
        trace.push(`${recitation ? 'recite' : 'answer'}:${candidate.id}:${correct}`);
        const message = `seed ${seed}: ${trace.join('; ')}`;
        const event = {
          cardId: candidate.id,
          grade: correct ? (3 as const) : (1 as const),
          correct,
          responseTimeSec: 2,
          distracted: false,
        };
        if (recitation) {
          state = transitionSession(state, {
            type: 'recitation-check',
            cardId: candidate.id,
            correct,
          }).state;
          state = transitionSession(state, {
            type: 'recitation-recorded',
            card: candidate,
            event,
          }).state;
          if (correct)
            state = transitionSession(state, {
              type: 'recitation-mastered',
              cardIds: [candidate.id],
            }).state;
        } else
          state = transitionSession(state, {
            type: 'simple-recorded',
            card: candidate,
            event,
          }).state;
        // Every transition leaves its input intact, including nested maps and sets.
        expect(before, message).toEqual(untouched);
        if (pick(4) === 0) {
          state = transitionSession(state, {
            type: 'restore',
            snapshot: before,
            card: before.cards.find((card) => card.id === candidate.id)!,
          }).state;
          expect(state, message).toEqual(untouched);
        } else {
          answered++;
          expectedOutcomes.set(candidate.id, correct ? 'correct' : 'wrong');
          if (correct) expectedMastered.add(candidate.id);
        }
        expect(state.cards.map((card) => card.id).sort(), message).toEqual(inventory);
        expect(state.simple.queue.map((card) => card.id).sort(), message).toEqual(inventory);
        expect(new Set(state.simple.queue.map((card) => card.id)).size, message).toBe(
          inventory.length,
        );
        expect(state.simple.mastered, message).toEqual(expectedMastered);
        expect(state.outcomes, message).toEqual(expectedOutcomes);
        expect(state.events.length, message).toBe(answered);
      }
      // A finite all-correct pass must terminate, regardless of the preceding trace.
      let remaining = state.simple.queue.filter(
        (card) => !state.simple.mastered.has(card.id),
      ).length;
      while (remaining-- > 0) {
        const next = transitionSession(state, { type: 'next', selection }).effects.find(
          (effect) => effect.type === 'present-card',
        );
        expect(next?.type).toBe('present-card');
        if (!next || next.type !== 'present-card') throw new Error('No next card');
        state = transitionSession(state, {
          type: 'simple-recorded',
          card: next.card,
          event: {
            cardId: next.card.id,
            grade: 3,
            correct: true,
            responseTimeSec: 1,
            distracted: false,
          },
        }).state;
      }
      expect(transitionSession(state, { type: 'next', selection }).effects).toContainEqual({
        type: 'finish',
        stop: [true],
      });
      expect(state.simple.mastered.size).toBe(inventory.length);
    },
  );

  it.each(SEEDS)(
    'restores scheduled cooldowns, retry receipts and events after random grades (seed %i)',
    (seed) => {
      const pick = randomIndex(seed);
      let state = initial(6);
      const originalIds = [...state.cardIds];
      for (let step = 0; step < 80; step++) {
        const previous = structuredClone(state);
        const snapshot = snapshotSession(state);
        const candidate = state.cards[pick(state.cards.length)];
        const correct = pick(2) === 0;
        const revision = pick(2) === 0;
        const now = NOW + step * 1000;
        const next = transitionSession(state, {
          type: 'scheduled-recorded',
          card: { ...candidate, due: now + 1000, reps: candidate.reps + 1 },
          event: {
            cardId: candidate.id,
            grade: correct ? 3 : 1,
            correct,
            responseTimeSec: 1,
            distracted: false,
          },
          eventId: `review-${step}`,
          recorded: true,
          deckId: 'unit',
          global: false,
          now,
          hasRevisionPlan: revision,
          revisionWindowEndsAt: revision ? NOW + 120_000 : undefined,
        });
        expect(state).toEqual(previous);
        state = next.state;
        expect(state.cardIds).toEqual(originalIds);
        expect(new Set(state.cards.map((card) => card.id)).size).toBe(originalIds.length);
        expect(state.events.length).toBe(previous.events.length + 1);
        expect(state.outcomes.get(candidate.id)).toBe(correct ? 'correct' : 'wrong');
        for (const cooldown of state.cooldowns.values()) expect(cooldown).toBeGreaterThanOrEqual(0);
        for (const id of state.revision.retryAt.keys())
          expect(state.revision.parked.has(id)).toBe(false);
        if (pick(3) === 0) {
          // Editing another card after an answer must survive undoing that answer.
          const other = state.cards.find((card) => card.id !== candidate.id)!;
          const edited = { ...other, front: `edited-${step}` };
          state = transitionSession(state, { type: 'replace-card', card: edited }).state;
          state = transitionSession(state, {
            type: 'restore',
            snapshot,
            card: snapshot.cards.find((card) => card.id === candidate.id)!,
          }).state;
          expect(state).toEqual({
            ...previous,
            cards: previous.cards.map((card) => (card.id === edited.id ? edited : card)),
            simple: {
              ...previous.simple,
              queue: previous.cards.map((card) => (card.id === edited.id ? edited : card)),
            },
          });
        }
      }
    },
  );

  it.each(SEEDS)(
    'removes suspended cards from the live pass without losing the stored pool (seed %i)',
    (seed) => {
      const pick = randomIndex(seed);
      let state = initial(8);
      const inventory = [...state.cardIds];
      const removed = new Set<string>();
      while (state.cardIds.length) {
        const id = state.cardIds[pick(state.cardIds.length)];
        const card = state.cards.find((card) => card.id === id)!;
        const before = structuredClone(state);
        const next = transitionSession(state, {
          type: 'remove-card',
          card: { ...card, suspended: true },
          simple: true,
        });
        expect(state).toEqual(before);
        state = next.state;
        removed.add(id);
        expect(state.cards.map((card) => card.id)).toEqual(inventory);
        expect(state.cardIds).toEqual(inventory.filter((id) => !removed.has(id)));
        expect(state.simple.queue.map((card) => card.id)).toEqual(state.cardIds);
        expect(
          state.cards
            .filter((card) => card.suspended)
            .map((card) => card.id)
            .sort(),
        ).toEqual([...removed].sort());
      }
    },
  );

  it('describes a graded write before accepting its acknowledgement', () => {
    const state = initial(1);
    const before = structuredClone(state);
    const request = transitionSession(state, {
      type: 'answer',
      simple: false,
      review: {
        card: state.cards[0],
        eventId: 'review',
        sessionId: 'session',
        sessionKind: 'practice',
        deck: course('unit', 30),
        kind: 'scheduling-unit',
        correct: true,
        responseTimeSec: 2,
        distracted: false,
        hintUsed: false,
      },
      grading: {
        machineMarked: null,
        manualGrade: 3,
        correct: true,
        responseTimeSec: 2,
        hintUsed: false,
        performance: undefined,
      },
    });
    expect(state).toEqual(before);
    expect(request.state).toEqual(before);
    expect(request.effects).toMatchObject([
      { type: 'persist-review', simple: false, review: { eventId: 'review', grade: 3 } },
    ]);
    // A rejected write has no acknowledgement: the pool, outcomes and event count stay intact.
    expect(request.state.events).toHaveLength(0);
    expect(request.state.outcomes.size).toBe(0);
  });

  it.each(SEEDS)('counts only thinking time over arbitrary edit pauses (seed %i)', (seed) => {
    const pick = randomIndex(seed);
    let now = NOW;
    let timer = { startedAt: now, responseSeconds: 0, pausedElapsed: 0 };
    let thinking = 0;
    for (let step = 0; step < 40; step++) {
      const duration = pick(5000);
      thinking += duration;
      now += duration;
      timer = transitionResponseTimer(timer, { type: 'pause', now });
      now += pick(60_000);
      timer = transitionResponseTimer(timer, { type: 'resume', now });
    }
    expect(transitionResponseTimer(timer, { type: 'reveal', now }).responseSeconds).toBe(
      thinking / 1000,
    );
  });

  it('keeps completion provisional until confirmation, supports undo and ignores duplicate proposals', () => {
    const summary: SessionSummary = {
      events: [],
      masteryBefore: 0,
      masteryAfter: 1,
      objectiveLabel: 'Cards correct in this pass',
      focusFraction: 1,
      reachedGoal: true,
      limitReached: false,
      mode: 'simple',
    };
    const initial = { finalising: false, confirmed: false, pending: null };
    const proposed = transitionCompletion(initial, { type: 'propose', summary, retainUndo: true });
    expect(proposed.effects).toEqual(['show-summary']);
    expect(proposed.state.pending).toBe(summary);
    expect(
      transitionCompletion(proposed.state, { type: 'propose', summary, retainUndo: true }).effects,
    ).toEqual([]);
    expect(transitionCompletion(proposed.state, { type: 'reset' }).state).toEqual(initial);
    const confirmed = transitionCompletion(proposed.state, { type: 'confirmed' });
    expect(confirmed.state).toEqual({ finalising: true, confirmed: true, pending: null });
    const automatic = transitionCompletion(initial, {
      type: 'propose',
      summary,
      retainUndo: false,
    });
    expect(automatic.effects).toContain('persist-completion');
    expect(
      transitionCompletion(automatic.state, { type: 'failed', retainUndo: false }).state.finalising,
    ).toBe(false);
  });

  it('finishes a scheduled due session when its captured work is exhausted', () => {
    const state = initial(1);
    const context = makeSessionContext(
      [
        {
          config: course('unit', 30),
          scope: { kind: 'scheduling-unit', schedulingUnitId: 'unit' },
        },
      ],
      'due',
      state.cards,
    );
    const updated = {
      ...state.cards[0],
      due: NOW + 86_400_000,
      reps: 1,
      state: 2 as const,
      stability: 10,
      difficulty: 5,
      lastReviewed: NOW,
    };
    const answered = transitionSession(state, {
      type: 'scheduled-recorded',
      card: updated,
      event: { cardId: updated.id, correct: true, grade: 3, responseTimeSec: 1, distracted: false },
      eventId: 'review',
      recorded: true,
      deckId: 'unit',
      global: false,
      now: NOW,
      hasRevisionPlan: false,
    }).state;
    expect(
      transitionSession(answered, {
        type: 'next',
        selection: { ...selection, simple: false, context },
      }).effects,
    ).toContainEqual({ type: 'finish', stop: [true, false, false], blockComplete: false });
  });
});
