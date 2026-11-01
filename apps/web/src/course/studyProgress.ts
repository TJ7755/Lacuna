import type { Card, Course, CourseAssessment, Lesson, LessonCardLink } from '../db/types';
import { isAvailable } from '../fsrs/eligibility';
import { rAtExam } from '../fsrs/forwardSim';
import { decayOf } from '../fsrs/fsrs';
import { progressHeading, progressValue } from '../fsrs/objective';
import { MASTERY_R } from '../fsrs/params';
import { calendarDaysUntil } from '../utils/datetime';
import type { ConceptPracticeItem } from '../questions/conceptPractice';
import { SCIENCE_TECHNIQUES, type TechniqueId } from '../questions/techniqueTags';
import type { Concept } from '../questions/types';
import { resolveAssessmentCoverage } from './assessmentCoverage';
import { courseLessonOrderPreference } from './lessonOrder';
import { lessonCardMembershipForLessons } from './lessonMembership';

export interface StudyProgress {
  exam?: {
    name: string;
    date: number;
    timeZone?: string;
    daysRemaining: number;
    value: number | null;
    label: string;
    securedCards: number;
    totalCards: number;
  };
  fsrs: {
    newCards: number;
    learningCards: number;
    reviewCards: number;
    dueCards: number;
    totalCards: number;
    meanStability: number | null;
    recallNow: number | null;
  };
  priorities: Array<{
    conceptId: string;
    name: string;
    dueCards: number;
    newCards: number;
    questionCount: number;
    skills: Array<{
      id: TechniqueId;
      name: string;
      demonstratedCount: number;
      gapCount: number;
      latestOutcome?: 'gap' | 'demonstrated';
    }>;
    knowledgeGap: boolean;
    applicationGap: boolean;
  }>;
  otherTopics?: StudyProgress['priorities'];
}

interface StudyProgressInput {
  course: Course;
  lessons: Lesson[];
  cards: Card[];
  assessments: CourseAssessment[];
  links: LessonCardLink[];
  concepts: Concept[];
  questionPractice: ConceptPracticeItem[];
  questionScopeConceptIds: readonly string[];
  dueReviewCardIds: ReadonlySet<string>;
  availableLessonIds: ReadonlySet<string>;
  assessmentId?: string;
  now?: number;
}

/** A report of current evidence and opportunities; it never writes learning or mastery evidence. */
export function buildStudyProgress(input: StudyProgressInput): StudyProgress {
  const now = input.now ?? Date.now();
  const { course } = input;
  const extensionIds = new Set(
    input.lessons.filter((lesson) => lesson.isExtension).map((lesson) => lesson.id),
  );
  const cards = input.cards.filter(
    (card) =>
      card.courseId === course.id &&
      !extensionIds.has(card.primaryLessonId ?? '') &&
      isAvailable(card, now),
  );
  const reviewed = cards.filter((card) => card.state !== 0 && card.lastReviewed !== null);
  const stability = reviewed.flatMap((card) =>
    card.stability !== null && Number.isFinite(card.stability) ? [card.stability] : [],
  );
  const decay = decayOf(course.fsrsParameters);
  const fsrs: StudyProgress['fsrs'] = {
    newCards: cards.filter((card) => card.state === 0).length,
    learningCards: cards.filter((card) => card.state === 1 || card.state === 3).length,
    reviewCards: cards.filter((card) => card.state === 2).length,
    dueCards: cards.filter((card) => input.dueReviewCardIds.has(card.id)).length,
    totalCards: cards.length,
    meanStability: stability.length
      ? stability.reduce((sum, value) => sum + value, 0) / stability.length
      : null,
    recallNow: reviewed.length
      ? reviewed.reduce((sum, card) => sum + rAtExam(card, now, now, decay), 0) / reviewed.length
      : null,
  };
  const upcoming = input.assessments
    .filter(
      (assessment): assessment is CourseAssessment & { examDate: number } =>
        assessment.courseId === course.id &&
        assessment.examDate !== undefined &&
        assessment.examDate >= now,
    )
    .sort(
      (a, b) => a.examDate - b.examDate || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
  let exam: StudyProgress['exam'];
  const fallbackDate = input.assessments.some(
    (assessment) => assessment.courseId === course.id && assessment.kind === 'final',
  )
    ? undefined
    : course.examDate;
  const explicit = upcoming.find((assessment) => assessment.id === input.assessmentId);
  const useFallback =
    !explicit &&
    fallbackDate !== undefined &&
    fallbackDate >= now &&
    (!upcoming[0] || fallbackDate < upcoming[0].examDate);
  const selected = explicit ?? (useFallback ? undefined : upcoming[0]);
  const date =
    selected?.examDate ??
    (fallbackDate !== undefined && fallbackDate >= now ? fallbackDate : undefined);
  if (date !== undefined) {
    const scope = selected
      ? resolveAssessmentCoverage(
          selected,
          input.lessons,
          cards,
          input.links,
          courseLessonOrderPreference(course),
          { course, concepts: input.concepts },
        ).cards
      : cards;
    // One displayed target has one horizon; nearer papers and lesson overrides cannot replace it.
    const target = { ...course, examDate: date };
    const timeZone = selected?.timeZone ?? course.timeZone;
    exam = {
      name: selected?.name ?? 'Final exam',
      date,
      timeZone,
      daysRemaining: calendarDaysUntil(date, now, timeZone),
      value: scope.length ? progressValue(scope, target, now) : null,
      label: progressHeading(course),
      securedCards: scope.filter((card) => rAtExam(card, date, now, decay) >= MASTERY_R).length,
      totalCards: scope.length,
    };
  }

  const accessibleIds = new Set(
    lessonCardMembershipForLessons(input.availableLessonIds, cards, input.links).map(
      (card) => card.id,
    ),
  );
  const opportunityCards = cards.filter(
    (card) =>
      accessibleIds.has(card.id) ||
      (card.state !== 0 && card.lastReviewed !== null && input.dueReviewCardIds.has(card.id)),
  );
  const questionScope = new Set(input.questionScopeConceptIds);
  const questions = new Map(input.questionPractice.map((item) => [item.conceptId, item]));
  const hasGap = (row: StudyProgress['priorities'][number]) =>
    row.knowledgeGap ||
    row.applicationGap ||
    row.skills.some(
      (skill) =>
        skill.latestOutcome === 'gap' ||
        questions.get(row.conceptId)?.needs?.techniques.includes(skill.id),
    );
  const allTopicRows: StudyProgress['priorities'] = course.archived
    ? []
    : input.concepts.flatMap((concept) => {
        if (concept.scope !== 'course' || concept.courseId !== course.id) return [];
        const members = opportunityCards.filter((card) => card.conceptId === concept.id);
        const practice = questionScope.has(concept.id) ? questions.get(concept.id) : undefined;
        const diagnostics = new Map(
          (practice?.diagnosticEvidence ?? []).map((evidence) => [evidence.categoryId, evidence]),
        );
        const skills = SCIENCE_TECHNIQUES.filter(
          (skill) =>
            practice?.techniqueIds?.includes(skill.id) ||
            practice?.needs?.techniques.includes(skill.id) ||
            diagnostics.has(skill.id),
        ).map((skill) => {
          const evidence = diagnostics.get(skill.id);
          return {
            id: skill.id,
            name: skill.name,
            demonstratedCount: evidence?.demonstratedCount ?? 0,
            gapCount: evidence?.gapCount ?? 0,
            latestOutcome: evidence?.latestOutcome,
          };
        });
        const priority = {
          conceptId: concept.id,
          name: concept.name,
          dueCards: members.filter((card) => input.dueReviewCardIds.has(card.id)).length,
          newCards: members.filter((card) => card.state === 0).length,
          questionCount: practice?.availableCount ?? 0,
          skills,
          knowledgeGap:
            practice?.needs?.knowledge === true ||
            diagnostics.get('knowledge')?.latestOutcome === 'gap',
          applicationGap:
            practice?.needs?.application === true ||
            diagnostics.get('application')?.latestOutcome === 'gap',
        };
        return members.length ||
          priority.questionCount ||
          skills.length ||
          practice?.unfinished ||
          hasGap(priority)
          ? [priority]
          : [];
      });
  allTopicRows.sort(
    (a, b) =>
      Number(hasGap(b)) - Number(hasGap(a)) ||
      b.dueCards - a.dueCards ||
      a.name.localeCompare(b.name, 'en-GB') ||
      a.conceptId.localeCompare(b.conceptId),
  );
  const priorities: StudyProgress['priorities'] = [];
  const otherTopics: StudyProgress['priorities'] = [];
  for (const row of allTopicRows) {
    const practice = questionScope.has(row.conceptId) ? questions.get(row.conceptId) : undefined;
    const hasWork =
      row.dueCards ||
      row.newCards ||
      practice?.unfinished ||
      (practice?.due && practice.unseenCount > 0) ||
      hasGap(row);
    (hasWork ? priorities : otherTopics).push(row);
  }
  return { exam, fsrs, priorities, otherTopics };
}
