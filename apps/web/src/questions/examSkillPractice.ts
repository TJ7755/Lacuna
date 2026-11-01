import { latestQuestionPracticeExposure } from './questionPracticeExposure';
import { questionStudyEligible } from './questionStudyEligibility';
import { makeEngine, decayOf } from '../fsrs/fsrs';
import { db } from '../db/schema';
import { startQuestionSetAttempt } from './questionSetAttemptRepository';
import {
  practiceContext,
  withinQuestionStudyScope,
  answers,
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
  studyEligible?: boolean;
  unfinished?: boolean;
  lastPracticeAt?: number;
  unseenCount: number;
  availableCount: number;
}

export async function listExamSkillPractice(
  courseId: string,
  now = Date.now(),
  options: {
    sittingStartedAt?: number;
    scopeConceptIds?: readonly string[];
    scopeLessonIds?: readonly string[];
  } = {},
): Promise<ExamSkillPracticeItem[]> {
  const data = await practiceContext(courseId);
  const schedules = deriveTechniqueSchedules(data.attempts);
  const [assessments, lessons, course] = await Promise.all([
    db.courseAssessments.where('courseId').equals(courseId).toArray(),
    db.lessons.where('courseId').equals(courseId).toArray(),
    db.courses.get(courseId),
  ]);
  const exposure = latestQuestionPracticeExposure(data.attempts);
  const params = course?.fsrsParameters ?? defaultFsrsParameters();
  const sim = { fsrs: makeEngine(params), decay: decayOf(params), expectedGrade: 3 as const };
  return SCIENCE_TECHNIQUES.flatMap(({ id, name }) => {
    const scope = options.scopeConceptIds ? new Set(options.scopeConceptIds) : undefined;
    const available = data.candidates.filter(
      (row) =>
        techniques(row.question).includes(id) &&
        withinQuestionStudyScope(row.question, scope) &&
        (options.scopeLessonIds === undefined ||
          answers(row.question).some(({ answer }) =>
            answer.allocations.some((allocation) => allocation.targetConceptIds.length > 0),
          ) ||
          row.set.lessonIds.every((lessonId) => options.scopeLessonIds?.includes(lessonId))),
    );
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
        unfinished: data.attempts.some(
          (attempt) =>
            attempt.mode === 'practice' &&
            attempt.status !== 'complete' &&
            attempt.undoneAt === undefined &&
            !attempt.conceptPractice &&
            attempt.practiceScope === 'question' &&
            attempt.receipt.questions.some(
              (question) =>
                techniques(question).includes(id) &&
                available.some(
                  (row) => row.set.id === attempt.questionSetId && row.question.id === question.id,
                ),
            ),
        ),
        lastPracticeAt: exposure.techniques.get(id),
        studyEligible: questionStudyEligible(schedule, {
          now,
          examDate,
          windowDays: course?.practiceUrgentWindowDays ?? 0,
          ctx: sim,
          lastPracticeAt: exposure.techniques.get(id),
          sittingStartedAt: options.sittingStartedAt,
        }),
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
    resume?: boolean;
    study?: {
      sittingStartedAt?: number;
      scopeConceptIds?: readonly string[];
      scopeLessonIds?: readonly string[];
    };
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
      let available = data.candidates.filter((candidate) => {
        const ids = techniques(candidate.question);
        return (
          (techniqueId ? ids.includes(techniqueId) : ids.length > 0) &&
          (!options.study ||
            withinQuestionStudyScope(
              candidate.question,
              options.study.scopeConceptIds ? new Set(options.study.scopeConceptIds) : undefined,
            )) &&
          (!options.study?.scopeLessonIds ||
            answers(candidate.question).some(({ answer }) =>
              answer.allocations.some((allocation) => allocation.targetConceptIds.length > 0),
            ) ||
            candidate.set.lessonIds.every((id) => options.study?.scopeLessonIds?.includes(id))) &&
          Object.entries(options.blueprint ?? {}).every(
            ([key, value]) =>
              candidate.set.bank?.blueprint[key as 'type' | 'difficulty' | 'context'] === value,
          )
        );
      });
      if (options.resume) {
        const unfinished = data.attempts
          .filter(
            (attempt) =>
              attempt.mode === 'practice' &&
              attempt.status !== 'complete' &&
              attempt.undoneAt === undefined &&
              !attempt.conceptPractice &&
              attempt.practiceScope === 'question' &&
              attempt.receipt.questions.some(
                (question) =>
                  (!techniqueId || techniques(question).includes(techniqueId)) &&
                  available.some(
                    (row) =>
                      row.set.id === attempt.questionSetId && row.question.id === question.id,
                  ),
              ),
          )
          .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))[0];
        if (unfinished) return { attempt: unfinished };
      }
      const skills = new Map(
        (await listExamSkillPractice(courseId, options.now, options.study)).map((skill) => [
          skill.techniqueId,
          skill,
        ]),
      );
      if (options.study)
        available = available.filter((candidate) =>
          techniques(candidate.question).some((id) => skills.get(id)?.studyEligible),
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
