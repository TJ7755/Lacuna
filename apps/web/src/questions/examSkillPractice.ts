import { db } from '../db/schema';
import { startQuestionSetAttempt } from './questionSetAttemptRepository';
import {
  practiceContext,
  selectPracticeQuestion,
  unseenCapacity,
} from './questionPracticeSelection';
import { SCIENCE_TECHNIQUES, type TechniqueId } from '@lacuna/core/questions/techniqueTags';
import type { QuestionScheduleState } from '@lacuna/core/questions/types';
import {
  deriveTechniqueSchedules,
  techniquePracticeStatus,
  questionTechniqueIds as techniques,
} from './techniqueSchedule';
import { emptyQuestionSchedule } from './scheduler';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { techniqueExamDate } from './techniqueExam';

export { QuestionPracticeExhaustedError } from './questionPracticeSelection';

export interface ExamSkillPracticeItem {
  techniqueId: TechniqueId;
  name: string;
  schedule: QuestionScheduleState;
  due: boolean;
  examDate?: number;
  readiness: 'unassessed' | 'due' | 'scheduled';
  estimatedRecall: number | null;
  dueAt: number | null;
  unseenCount: number;
  availableCount: number;
}

export async function listExamSkillPractice(
  courseId: string,
  now = Date.now(),
): Promise<ExamSkillPracticeItem[]> {
  const data = await practiceContext(courseId);
  const schedules = deriveTechniqueSchedules(data.attempts);
  const [assessments, lessons, course] = await Promise.all([
    db.courseAssessments.where('courseId').equals(courseId).toArray(),
    db.lessons.where('courseId').equals(courseId).toArray(),
    db.courses.get(courseId),
  ]);
  return SCIENCE_TECHNIQUES.flatMap(({ id, name }) => {
    const available = data.candidates.filter((row) => techniques(row.question).includes(id));
    if (!available.length) return [];
    const schedule = schedules.get(id) ?? emptyQuestionSchedule();
    const examDate = techniqueExamDate(
      available.map((row) => ({ ...row.set, questions: [row.question] })),
      assessments,
      lessons,
      now,
      course?.localLessonOrder,
      data.concepts,
      course,
    );
    const { dueAt, due, estimatedRecall } = techniquePracticeStatus(
      schedule,
      course?.fsrsParameters ?? defaultFsrsParameters(),
      now,
      examDate,
    );
    return [
      {
        techniqueId: id,
        name,
        schedule,
        estimatedRecall,
        dueAt,
        due,
        examDate,
        readiness:
          schedule.lastReviewed === null
            ? ('unassessed' as const)
            : due
              ? ('due' as const)
              : ('scheduled' as const),
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
    [
      db.courses,
      db.concepts,
      db.questionSets,
      db.questionSetAttempts,
      db.courseAssessments,
      db.lessons,
    ],
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
      const skills = new Map(
        (await listExamSkillPractice(courseId, options.now)).map((skill) => [
          skill.techniqueId,
          skill,
        ]),
      );
      const due = (question: (typeof available)[number]['question']) =>
        techniques(question).some((id) => skills.get(id)?.due);
      const selected = selectPracticeQuestion(
        data,
        available,
        options,
        (a, b) => Number(due(b.question)) - Number(due(a.question)),
        (a, b) =>
          Math.min(...techniques(a.question).map((id) => skills.get(id)?.dueAt ?? 0)) -
          Math.min(...techniques(b.question).map((id) => skills.get(id)?.dueAt ?? 0)),
      );
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
