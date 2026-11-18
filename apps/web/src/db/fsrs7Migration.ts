import { migrateFsrs7Questions } from '../questions/fsrs7Migration';
import type { QuestionAttempt, QuestionDefinition } from '@lacuna/core/questions/types';
import type { Card, CourseRecord, SchedulingUnitRecord } from '@lacuna/core/db/types';
import { type ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';
import { defaultFsrsParameters, FSRS_VERSION } from '@lacuna/core/fsrs/params';
import { replayCards, hasCompleteMemoryHistory } from '../sync/snapshotReviews';
import type { Transaction } from 'dexie';

/** Old weights have no exact conversion. Keep scheduling policy, replace only model weights. */
export function migrateFsrs7Configuration<T extends CourseRecord | SchedulingUnitRecord>(
  row: T,
): T {
  if (!row.fsrsParameters) return row;
  if (row.fsrsVersion === FSRS_VERSION && row.fsrsParameters.w.length === 34) return row;
  return {
    ...row,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: {
      ...defaultFsrsParameters(),
      ...row.fsrsParameters,
      w: defaultFsrsParameters().w,
    },
  };
}

/** Replace memory only: an upgrade must not move an existing due date or learning step. */
export function migrateFsrs7Cards(
  cards: Card[],
  events: ReviewHistoryEntry[],
  units: SchedulingUnitRecord[],
  courses: CourseRecord[],
): Card[] {
  const byCard = new Map<string, ReviewHistoryEntry[]>();
  for (const event of events) {
    const list = byCard.get(event.cardId) ?? [];
    list.push(event);
    byCard.set(event.cardId, list);
  }
  return cards.map((card) => {
    if (card.stabilityFast !== null && card.stabilityFast !== undefined) return card;
    if (!hasCompleteMemoryHistory(card, byCard.get(card.id) ?? []))
      return { ...card, stabilityFast: null };
    const replayed = replayCards([card], byCard.get(card.id) ?? [], units, courses)[0];
    return {
      ...card,
      stability: replayed.stability,
      stabilityFast: replayed.stabilityFast,
      difficulty: replayed.difficulty,
    };
  });
}

export async function upgradeFsrs7(tx: Transaction): Promise<void> {
  const rows = async (name: string) =>
    tx.storeNames.includes(name) ? tx.table(name).toArray() : [];
  const courses = ((await rows('courses')) as CourseRecord[]).map(migrateFsrs7Configuration);
  const units = ((await rows('schedulingUnits')) as SchedulingUnitRecord[]).map(
    migrateFsrs7Configuration,
  );
  const cards = (await rows('cards')) as Card[];
  const history = (await rows('reviewHistory')) as ReviewHistoryEntry[];
  const migrated = migrateFsrs7Cards(cards, history, units, courses);
  // Retired unsupported rows are evidence, not schedulable Questions.
  const scheduledQuestions = ((await rows('questions')) as QuestionDefinition[]).filter(
    (question) => question.scheduleEpoch,
  );
  const questions = migrateFsrs7Questions(
    scheduledQuestions,
    (await rows('questionAttempts')) as QuestionAttempt[],
    courses,
  );
  if (courses.length) await tx.table('courses').bulkPut(courses);
  if (units.length) await tx.table('schedulingUnits').bulkPut(units);
  if (migrated.length) await tx.table('cards').bulkPut(migrated);
  if (questions.length) await tx.table('questions').bulkPut(questions);
}
