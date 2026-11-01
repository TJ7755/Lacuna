import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import type { TechniqueId } from '@lacuna/core/questions/techniqueTags';
import { answers } from './questionPracticeSelection';
import { exposedQuestions } from './questionExposure';
import { questionTechniqueIds } from './techniqueSchedule';

/** Exposure prevents a sitting loop even when assistance or unresolved marks exclude memory. */
export function latestQuestionPracticeExposure(attempts: readonly QuestionSetAttemptRecord[]) {
  const concepts = new Map<string, number>();
  const techniques = new Map<TechniqueId, number>();
  for (const attempt of attempts) {
    if (attempt.mode !== 'practice') continue;
    for (const question of exposedQuestions(attempt)) {
      const at = Math.max(attempt.createdAt, attempt.updatedAt);
      for (const { answer } of answers(question))
        for (const allocation of answer.allocations) {
          if (allocation.dimension === 'knowledge') continue;
          for (const id of allocation.targetConceptIds)
            concepts.set(id, Math.max(concepts.get(id) ?? -Infinity, at));
        }
      for (const id of questionTechniqueIds(question))
        techniques.set(id, Math.max(techniques.get(id) ?? -Infinity, at));
    }
  }
  return { concepts, techniques };
}
