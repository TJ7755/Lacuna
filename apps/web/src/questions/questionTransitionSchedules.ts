import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import type { QuestionDefinition, QuestionScheduleState } from '@lacuna/core/questions/types';

export interface QuestionScheduleSeed {
  state: QuestionScheduleState;
  recordedAt: number;
}

/**
 * Individual schedules cannot be summed into a Concept schedule. Seed each Concept
 * with its most urgent migrated source, retaining every exact source schedule for audit.
 * New first markings replay after that source's last schedule update; old evidence is
 * never regraded or replayed a second time.
 */
export function transitionScheduleSeeds(
  sources: readonly QuestionDefinition[],
  sets: readonly QuestionSetRecord[],
): Map<string, QuestionScheduleSeed> {
  const seeds = new Map<string, QuestionScheduleSeed>();
  const byId = new Map(sources.map((row) => [row.id, row]));
  for (const set of [...sets].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = byId.get(set.legacyQuestionId ?? '');
    if (!source || source.suspended) continue;
    for (const conceptId of set.questions.flatMap(
      (question) => question.answer?.allocations.flatMap((point) => point.targetConceptIds) ?? [],
    )) {
      const previous = seeds.get(conceptId);
      if (!previous || (source.due ?? 0) < (previous.state.due ?? 0)) {
        const {
          stability,
          difficulty,
          lastReviewed,
          reps,
          lapses,
          state,
          due,
          scheduledDays,
          learningSteps,
        } = source;
        seeds.set(conceptId, {
          state: {
            stability,
            difficulty,
            lastReviewed,
            reps,
            lapses,
            state,
            due,
            scheduledDays,
            learningSteps,
          },
          recordedAt: source.scheduleUpdatedAt,
        });
      }
    }
  }
  return seeds;
}
