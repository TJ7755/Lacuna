import { gradeQuestionAttempt } from './grading';
import {
  answers,
  withinQuestionStudyScope as withinConceptScope,
  practiceContext,
  unseenCapacity,
  selectPracticeQuestion,
  QuestionPracticeExhaustedError,
} from './questionPracticeSelection';
import { db } from '../db/schema';
import { startQuestionSetAttempt } from './questionSetAttemptRepository';
import {
  type ConceptPracticeSelection,
  type QuestionSetAttemptRecord,
} from '@lacuna/core/questions/questionSetAttempts';
import { emptyQuestionSchedule, scheduleQuestionReview } from './scheduler';
import type { QuestionScheduleState } from '@lacuna/core/questions/types';
import {
  deriveConceptDiagnosticEvidence,
  deriveConceptPracticeNeeds,
  questionGapPriority,
  type ConceptPracticeNeeds,
  type DiagnosticCategoryEvidence,
} from './techniqueEvidence';
import { deriveTechniqueSchedules, questionTechniqueIds } from './techniqueSchedule';
import { latestQuestionPracticeExposure } from './questionPracticeExposure';
import { questionStudyEligible } from './questionStudyEligibility';
import { techniqueExamDate } from './techniqueExam';
import { makeEngine, decayOf } from '../fsrs/fsrs';
import type { TechniqueId } from '@lacuna/core/questions/techniqueTags';

export { undoConceptPracticeAttempt } from './questionSetAttemptRepository';
export { questionPresentationFingerprint as conceptPracticeFingerprint } from './generators/declarative';

/** Criterion totals retain partial credit. Ambiguous or unresolved evidence cannot move a schedule. */
export function deriveConceptApplicationSchedules(
  attempts: readonly QuestionSetAttemptRecord[],
): Map<string, QuestionScheduleState> {
  const schedules = new Map<string, QuestionScheduleState>();
  const events = attempts
    .filter((attempt) => attempt.undoneAt === undefined)
    .flatMap((attempt) => (attempt.firstMarking ?? []).map((snapshot) => ({ attempt, snapshot })))
    .sort(
      (a, b) =>
        a.snapshot.recordedAt - b.snapshot.recordedAt ||
        a.attempt.id.localeCompare(b.attempt.id) ||
        a.snapshot.questionId.localeCompare(b.snapshot.questionId),
    );
  for (const { attempt, snapshot } of events) {
    if (attempt.disputedQuestionIds?.includes(snapshot.questionId)) continue;
    const question = attempt.receipt.questions.find((row) => row.id === snapshot.questionId);
    if (!question) continue;
    const nodes = answers(question);
    // Assistance on any part contaminates the original question, including follow-through work.
    if (
      attempt.assistance.some(
        (event) =>
          nodes.some((node) => node.nodeId === event.nodeId) &&
          event.occurredAt <= snapshot.recordedAt,
      )
    )
      continue;
    const decisions = new Map(snapshot.decisions.map((row) => [row.allocationId, row]));
    const totals = new Map<string, { earned: number; available: number; unresolved: boolean }>();
    for (const { answer } of nodes)
      for (const allocation of answer.allocations) {
        if (allocation.dimension === 'knowledge') continue;
        for (const conceptId of allocation.targetConceptIds) {
          const total = totals.get(conceptId) ?? { earned: 0, available: 0, unresolved: false };
          const decision = decisions.get(allocation.id);
          total.available += allocation.maxMarks;
          if (allocation.targetConceptIds.length !== 1 || decision?.status !== 'awarded')
            total.unresolved = true;
          else total.earned += decision.marks;
          totals.set(conceptId, total);
        }
      }
    for (const [conceptId, total] of totals) {
      if (total.unresolved || !total.available) continue;
      const grade =
        snapshot.gradeMappingVersion === 'fractional-hard-v2'
          ? gradeQuestionAttempt({
              marksEarned: total.earned,
              marksAvailable: total.available,
              hasUndeterminedVerdict: total.unresolved,
              hasUnresolvedDispute: false,
            })
          : total.earned === total.available
            ? 3
            : 1;
      if (grade === null) continue;
      schedules.set(
        conceptId,
        scheduleQuestionReview(
          schedules.get(conceptId) ?? emptyQuestionSchedule(),
          grade,
          snapshot.schedulerConfig,
          snapshot.recordedAt,
        ).schedule,
      );
    }
  }
  return schedules;
}

export interface ConceptPracticeItem {
  conceptId: string;
  name: string;
  schedule: QuestionScheduleState;
  due: boolean;
  unseenCount: number;
  familiarCount: number;
  availableCount: number;
  needs?: ConceptPracticeNeeds;
  diagnosticEvidence?: readonly DiagnosticCategoryEvidence[];
  techniqueIds?: TechniqueId[];
  unfinished?: boolean;
  studyEligible?: boolean;
  studyUnseenCount?: number;
  lastPracticeAt?: number;
  eligibleTechniqueIds?: TechniqueId[];
  examDate?: number;
}

async function context(courseId: string, now = Date.now()) {
  const data = await practiceContext(courseId);
  const [course, assessments, lessons] = await Promise.all([
    db.courses.get(courseId),
    db.courseAssessments.where('courseId').equals(courseId).toArray(),
    db.lessons.where('courseId').equals(courseId).toArray(),
  ]);
  const techniqueSchedules = deriveTechniqueSchedules(data.attempts);
  return {
    course,
    assessments,
    lessons,
    techniqueSchedules,
    exposure: latestQuestionPracticeExposure(data.attempts),
    sim: course
      ? {
          fsrs: makeEngine(course.fsrsParameters),
          decay: decayOf(course.fsrsParameters),
          expectedGrade: 3 as const,
        }
      : undefined,
    ...data,
    needs: deriveConceptPracticeNeeds(data.attempts, data.sets, now, techniqueSchedules),
    schedules: deriveConceptApplicationSchedules(data.attempts),
  };
}

function unfinishedPractice(
  data: Awaited<ReturnType<typeof context>>,
  conceptId: string | undefined,
  scope: ReadonlySet<string> | undefined,
) {
  return data.attempts
    .filter(
      (attempt) =>
        attempt.conceptPractice &&
        attempt.status !== 'complete' &&
        attempt.undoneAt === undefined &&
        (!conceptId || attempt.conceptPractice.conceptId === conceptId) &&
        (!scope || scope.has(attempt.conceptPractice.conceptId)) &&
        attempt.receipt.questions.every((question) => withinConceptScope(question, scope)) &&
        data.candidates.some((candidate) => candidate.set.id === attempt.questionSetId),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))[0];
}

function studyCandidate(
  data: Awaited<ReturnType<typeof context>>,
  candidate: Awaited<ReturnType<typeof practiceContext>>['candidates'][number],
  conceptId: string,
  now: number,
  sittingStartedAt?: number,
) {
  const examDate = techniqueExamDate(
    [{ ...candidate.set, questions: [candidate.question] }],
    data.assessments,
    data.lessons,
    now,
    data.course?.localLessonOrder,
    data.concepts,
    data.course,
  );
  const ids = questionTechniqueIds(candidate.question).filter((id) =>
    answers(candidate.question).some(({ answer }) =>
      answer.allocations.some(
        (allocation) =>
          allocation.targetConceptIds.includes(conceptId) &&
          allocation.techniqueTags?.provenance.source === 'author' &&
          allocation.techniqueTags.techniqueIds.includes(id),
      ),
    ),
  );
  if (!data.course || !data.sim) return { eligible: false, techniques: [], examDate };
  const timing = {
    now,
    examDate,
    windowDays: data.course.practiceUrgentWindowDays,
    ctx: data.sim,
    sittingStartedAt,
  };
  const conceptLastPractice = data.exposure.concepts.get(conceptId);
  const eligibleTechniques = ids.filter((id) =>
    questionStudyEligible(data.techniqueSchedules.get(id) ?? emptyQuestionSchedule(), {
      ...timing,
      lastPracticeAt: Math.max(
        conceptLastPractice ?? -Infinity,
        data.exposure.techniques.get(id) ?? -Infinity,
      ),
    }),
  );
  const schedule = data.schedules.get(conceptId) ?? emptyQuestionSchedule();
  const need = data.needs.get(conceptId);
  return {
    eligible:
      ids.length > 0
        ? eligibleTechniques.length > 0
        : questionStudyEligible(schedule, {
            ...timing,
            lastPracticeAt: conceptLastPractice,
            ordinaryDue:
              schedule.due === null ||
              schedule.due <= now ||
              Boolean(need?.knowledge || need?.application || need?.techniques.length),
          }),
    techniques: eligibleTechniques,
    examDate,
  };
}

export async function listConceptPractice(
  courseId: string,
  now = Date.now(),
  scopeConceptIds?: readonly string[],
  options: { sittingStartedAt?: number } = {},
): Promise<ConceptPracticeItem[]> {
  const data = await context(courseId, now);
  const diagnosticEvidence = deriveConceptDiagnosticEvidence(data.attempts, data.sets);
  const scope = scopeConceptIds ? new Set(scopeConceptIds) : undefined;
  return data.concepts
    .filter((concept) => !scope || scope.has(concept.id))
    .map((concept) => {
      const schedule = data.schedules.get(concept.id) ?? emptyQuestionSchedule();
      const available = data.candidates.filter(
        (row) => row.conceptIds.includes(concept.id) && withinConceptScope(row.question, scope),
      );
      const study = available.map((candidate) => ({
        candidate,
        ...studyCandidate(data, candidate, concept.id, now, options.sittingStartedAt),
      }));
      const studyUnseenCount = study.reduce(
        (total, row) => total + (row.eligible ? unseenCapacity(row.candidate, data) : 0),
        0,
      );
      const studyDates = study.flatMap((row) =>
        row.eligible && row.examDate !== undefined ? [row.examDate] : [],
      );
      const unseenCount = available.reduce((total, row) => total + unseenCapacity(row, data), 0);
      const availableCount = available.reduce((total, row) => total + row.capacity, 0);
      return {
        conceptId: concept.id,
        name: concept.name,
        schedule,
        studyEligible: study.some((row) => row.eligible),
        studyUnseenCount,
        lastPracticeAt: data.exposure.concepts.get(concept.id),
        eligibleTechniqueIds: [...new Set(study.flatMap((row) => row.techniques))],
        examDate: studyDates.length ? Math.min(...studyDates) : undefined,
        due:
          schedule.due === null ||
          schedule.due <= now ||
          Boolean(
            data.needs.get(concept.id)?.knowledge ||
            data.needs.get(concept.id)?.application ||
            data.needs.get(concept.id)?.techniques.length,
          ),
        unseenCount,
        familiarCount: availableCount - unseenCount,
        availableCount,
        needs: data.needs.get(concept.id),
        diagnosticEvidence: diagnosticEvidence.get(concept.id),
        techniqueIds: [
          ...new Set(
            available.flatMap(({ question }) =>
              answers(question).flatMap(({ answer }) =>
                answer.allocations.flatMap((allocation) =>
                  allocation.dimension !== 'knowledge' &&
                  allocation.targetConceptIds.includes(concept.id)
                    ? (allocation.techniqueTags?.techniqueIds ?? [])
                    : [],
                ),
              ),
            ),
          ),
        ],
        unfinished: Boolean(unfinishedPractice(data, concept.id, scope)),
      };
    })
    .sort(
      (a, b) =>
        Number(b.due) - Number(a.due) ||
        (a.schedule.due ?? 0) - (b.schedule.due ?? 0) ||
        a.conceptId.localeCompare(b.conceptId),
    );
}

export class ConceptPracticeExhaustedError extends Error {
  constructor(public readonly reason: 'no-due-concepts' | 'no-unseen-questions' | 'no-questions') {
    super(
      reason === 'no-unseen-questions'
        ? 'No unseen questions remain. Choose familiar practice explicitly.'
        : reason === 'no-due-concepts'
          ? 'No Concepts are due.'
          : 'No questions are available for this Concept.',
    );
    this.name = 'ConceptPracticeExhaustedError';
  }
}

export async function startConceptPractice(
  courseId: string,
  conceptId?: string,
  options: {
    allowFamiliar?: boolean;
    now?: number;
    mode?: 'due' | 'mixed';
    study?: { sittingStartedAt?: number };
    scopeConceptIds?: readonly string[];
    resume?: boolean;
    blueprint?: Partial<{ type: string; difficulty: string; context: string }>;
  } = {},
): Promise<{ attempt: QuestionSetAttemptRecord; selection: ConceptPracticeSelection }> {
  const now = options.now ?? Date.now();
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
      const data = await context(courseId, now);
      const course = await db.courses.get(courseId);
      if (!course || course.archived) throw new Error('This course is unavailable for practice.');
      const scope = options.scopeConceptIds ? new Set(options.scopeConceptIds) : undefined;
      if (options.resume) {
        const unfinished = unfinishedPractice(data, conceptId, scope);
        if (unfinished) return { attempt: unfinished, selection: unfinished.conceptPractice! };
      }
      const due = data.concepts.filter((concept) => {
        const schedule = data.schedules.get(concept.id);
        const needs = data.needs.get(concept.id);
        return (
          !schedule ||
          schedule.due === null ||
          schedule.due <= now ||
          Boolean(needs?.knowledge || needs?.application || needs?.techniques.length)
        );
      });
      const eligible = (
        conceptId
          ? data.concepts.filter((concept) => concept.id === conceptId)
          : options.mode === 'mixed'
            ? data.concepts
            : due
      ).filter((concept) => !scope || scope.has(concept.id));
      if (!eligible.length) throw new ConceptPracticeExhaustedError('no-due-concepts');
      const ids = new Set(eligible.map((concept) => concept.id));
      const available = data.candidates.filter(
        (candidate) =>
          candidate.conceptIds.some((id) => ids.has(id)) &&
          withinConceptScope(candidate.question, scope) &&
          (!options.study ||
            candidate.conceptIds.some(
              (id) =>
                ids.has(id) &&
                (!conceptId || id === conceptId) &&
                studyCandidate(data, candidate, id, now, options.study?.sittingStartedAt).eligible,
            )) &&
          Object.entries(options.blueprint ?? {}).every(
            ([key, value]) =>
              candidate.set.bank?.blueprint[key as 'type' | 'difficulty' | 'context'] === value,
          ),
      );
      if (!available.length) throw new ConceptPracticeExhaustedError('no-questions');
      let selected;
      try {
        selected = selectPracticeQuestion(
          data,
          available,
          { ...options, mode: options.mode ?? 'due' },
          (a, b) =>
            questionGapPriority(b.question, data.needs) -
            questionGapPriority(a.question, data.needs),
          (a, b) =>
            Math.min(
              ...a.conceptIds
                .filter((id) => ids.has(id))
                .map((id) => data.schedules.get(id)?.due ?? 0),
            ) -
            Math.min(
              ...b.conceptIds
                .filter((id) => ids.has(id))
                .map((id) => data.schedules.get(id)?.due ?? 0),
            ),
        );
      } catch (cause) {
        if (cause instanceof QuestionPracticeExhaustedError)
          throw new ConceptPracticeExhaustedError(cause.reason);
        throw cause;
      }
      const selection: ConceptPracticeSelection = {
        conceptId:
          conceptId ??
          selected.candidate.conceptIds
            .filter(
              (id) =>
                ids.has(id) &&
                (!options.study ||
                  studyCandidate(data, selected.candidate, id, now, options.study.sittingStartedAt)
                    .eligible),
            )
            .sort()[0],
        questionSetId: selected.set.id,
        questionId: selected.question.id,
        novelty: data.seen.has(selected.fingerprint) ? 'familiar' : 'unseen',
        fingerprint: selected.fingerprint,
      };
      const attempt = await startQuestionSetAttempt(
        selected.set.id,
        'practice',
        now,
        selection,
        selected.index,
      );
      return { attempt, selection };
    },
  );
}
