import assert from 'node:assert/strict';
import { FSRS7_DEFAULT_WEIGHTS, FSRS7Model } from 'ts-fsrs/models/fsrs-7';

/** The installed-upgrade fixture makes one real answer before migrating its database. */
export function assertUpgradeStudyRecords(before, after) {
  assert.equal(before.reviewHistory.length, 1, 'The upgrade fixture must contain one answer.');
  const [answer] = before.reviewHistory;
  const reviewed = before.cards.find((card) => card.id === answer.cardId);
  assert.equal(reviewed?.reps, 1, 'The upgrade fixture must start from a new card.');
  assert(before.cards.every((card) => card.id === answer.cardId || card.state === 0));
  const memory = FSRS7Model.create({ config: { weights: FSRS7_DEFAULT_WEIGHTS } }).step({
    memoryState: null,
    rating: answer.grade,
    elapsedDays: 0,
  });
  const configuration = (row) => ({
    ...row,
    fsrsVersion: 7,
    fsrsParameters: { ...row.fsrsParameters, w: [...FSRS7_DEFAULT_WEIGHTS] },
  });
  assert.deepEqual(
    after,
    {
      ...before,
      courses: before.courses.map(configuration),
      schedulingUnits: before.schedulingUnits.map(configuration),
      cards: before.cards.map((card) => ({
        ...card,
        ...(card.id === answer.cardId ? memory : { stabilityFast: null }),
      })),
    },
    'Upgrade changed study records beyond the FSRS 7 memory migration',
  );
}
