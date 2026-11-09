import { expect, it } from 'vitest';
import { card, NOW } from '../../fsrs/session.testFixtures';
import {
  introductionProgress,
  introductionStage,
  prepareIntroduction,
  recordIntroductionAttempt,
  restoreIntroduction,
} from './lessonIntroduction';
import { emptySessionState } from './sessionRuntime';
import { snapshotSession, transitionSession } from './sessionMachine';

const selection = {
  simple: true,
  context: null,
  now: NOW,
  revisionPlan: null,
  windowStartedAt: 0,
  performance: new Map(),
};

it('sees all four cards first, then opens at most two chunks while interleaving first choices and practice', () => {
  const cards = Array.from({ length: 12 }, (_, index) => card(String(index + 1), 'lesson'));
  let state = emptySessionState();
  state.cards = cards;
  state.simple.queue = cards;
  state.introduction = prepareIntroduction(cards, undefined);
  const next = () =>
    transitionSession(state, { type: 'next', selection }).effects.find(
      (effect) => effect.type === 'present-card',
    )?.card;
  const recognise = (correct: boolean) => {
    const current = next()!;
    const result = transitionSession(state, {
      type: 'introduction-checked',
      card: current,
      correct,
    });
    expect(result.effects).toEqual([{ type: 'persist-resume' }]);
    expect(result.state.events).toEqual(state.events);
    expect(result.state.outcomes).toEqual(state.outcomes);
    state = result.state;
  };
  const recall = (correct: boolean) => {
    const current = next()!;
    state = transitionSession(state, {
      type: 'simple-recorded',
      card: current,
      event: {
        cardId: current.id,
        correct,
        grade: correct ? 3 : 1,
        responseTimeSec: 2,
        distracted: false,
      },
    }).state;
  };

  for (const [index, correct] of [false, true, false, true].entries()) {
    expect(next()?.id).toBe(String(index + 1));
    recognise(correct);
  }
  expect(next()?.id).toBe('5');
  recognise(true);
  expect(next()?.id).toBe('1');
  recognise(true);
  expect(next()?.id).toBe('6');

  let reachedThirdChunk = false;
  for (let step = 0; step < 35; step += 1) {
    const current = next();
    if (!current) break;
    const stage = introductionStage(state.introduction, current.id);
    if (Number(current.id) >= 9) {
      expect(['1', '2', '3', '4'].every((id) => state.simple.mastered.has(id))).toBe(true);
      expect(
        ['5', '6', '7', '8'].every((id) =>
          state.introduction?.attempts.some(([attempted]) => id === attempted),
        ),
      ).toBe(true);
      reachedThirdChunk = true;
      break;
    }
    if (stage === 'recall') recall(true);
    else recognise(true);
  }
  expect(reachedThirdChunk).toBe(true);
});

it('keeps typed misses in recall after FSRS changes and resumes only already-assigned non-new cards', () => {
  const fresh = card('fresh', 'lesson');
  const old = card('old', 'lesson', { state: 1 });
  const cards = [fresh, old];
  let state = emptySessionState();
  state.cards = cards;
  state.simple.queue = cards;
  state.introduction = prepareIntroduction(cards, undefined);
  const beforeRecognition = snapshotSession(state);
  expect(introductionStage(state.introduction, old.id)).toBeUndefined();

  state = transitionSession(state, {
    type: 'introduction-checked',
    card: fresh,
    correct: true,
  }).state;
  expect(introductionStage(state.introduction, fresh.id)).toBe('recall');
  expect(introductionStage(beforeRecognition.introduction, fresh.id)).toBe('familiarise');
  const learning = { ...fresh, state: 1 as const };
  state = transitionSession(state, {
    type: 'simple-recorded',
    card: learning,
    event: { cardId: fresh.id, correct: false, grade: 1, responseTimeSec: 2, distracted: false },
  }).state;

  const restored = restoreIntroduction(JSON.parse(JSON.stringify(state.introduction)));
  const resumed = prepareIntroduction(state.simple.queue, restored);
  expect(introductionStage(resumed, fresh.id)).toBe('recall');
  expect(introductionStage(resumed, old.id)).toBeUndefined();
  expect(resumed?.last).toEqual({ cardId: fresh.id, first: false });
});

it('counts completed cards across chunks, including exposed cards outside the resumed pool', () => {
  const cards = Array.from({ length: 6 }, (_, index) => card(String(index + 1), 'lesson'));
  let introduction = prepareIntroduction(cards, undefined)!;
  for (const id of ['1', '2', '3', '4']) {
    introduction = recordIntroductionAttempt(introduction, id, 'passed');
  }
  introduction = recordIntroductionAttempt(introduction, '5', 'retry');
  introduction = recordIntroductionAttempt(introduction, '6', 'passed');
  expect(introductionProgress(introduction, ['5', '6', 'old'], new Set(['6', 'old']))).toEqual({
    completed: 6,
    total: 7,
  });
});
