import { db } from '../db/schema';
import { startQuestionSetAttempt } from './questionSetAttemptRepository';
import {
  answers,
  practiceContext,
  selectPracticeQuestion,
  unseenCapacity,
} from './questionPracticeSelection';
import { SCIENCE_TECHNIQUES, type TechniqueId } from '@lacuna/core/questions/techniqueTags';
import type { QuestionSetQuestion } from '@lacuna/core/questions/questionSets';

export { QuestionPracticeExhaustedError } from './questionPracticeSelection';

function techniques(question: QuestionSetQuestion): TechniqueId[] {
  return [
    ...new Set(
      answers(question).flatMap(({ answer }) =>
        answer.allocations.flatMap((allocation) =>
          allocation.dimension !== 'knowledge' &&
          allocation.techniqueTags?.provenance.source === 'author'
            ? allocation.techniqueTags.techniqueIds
            : [],
        ),
      ),
    ),
  ];
}

export interface ExamSkillPracticeItem {
  techniqueId: TechniqueId;
  name: string;
  unseenCount: number;
  availableCount: number;
}

export async function listExamSkillPractice(courseId: string): Promise<ExamSkillPracticeItem[]> {
  const data = await practiceContext(courseId);
  return SCIENCE_TECHNIQUES.flatMap(({ id, name }) => {
    const available = data.candidates.filter((row) => techniques(row.question).includes(id));
    if (!available.length) return [];
    return [
      {
        techniqueId: id,
        name,
        unseenCount: available.reduce((total, row) => total + unseenCapacity(row, data), 0),
        availableCount: available.reduce((total, row) => total + row.capacity, 0),
      },
    ];
  });
}

export async function startExamSkillPractice(
  courseId: string,
  techniqueId?: TechniqueId,
  options: {
    allowFamiliar?: boolean;
    now?: number;
    blueprint?: Partial<{ type: string; difficulty: string; context: string }>;
  } = {},
) {
  return db.transaction(
    'rw',
    [db.courses, db.concepts, db.questionSets, db.questionSetAttempts],
    async () => {
      const course = await db.courses.get(courseId);
      if (!course || course.archived) throw new Error('This course is unavailable for practice.');
      const data = await practiceContext(courseId);
      const available = data.candidates.filter((candidate) => {
        const ids = techniques(candidate.question);
        return (
          (techniqueId ? ids.includes(techniqueId) : ids.length > 0) &&
          Object.entries(options.blueprint ?? {}).every(
            ([key, value]) =>
              candidate.set.bank?.blueprint[key as 'type' | 'difficulty' | 'context'] === value,
          )
        );
      });
      const selected = selectPracticeQuestion(data, available, options);
      const attempt = await startQuestionSetAttempt(
        selected.set.id,
        'practice',
        options.now,
        {
          questionSetId: selected.set.id,
          questionId: selected.question.id,
          fingerprint: selected.fingerprint,
          novelty: selected.novelty,
        },
        selected.index,
      );
      return { attempt };
    },
  );
}
