import { lessonCardMembershipForLessons } from './lessonMembership';
import type { Card, Course, Lesson, LessonCardLink } from '@lacuna/core/db/types';
import type { ExamDateContext } from '../fsrs/examDate';
import { resolveCardExamDate } from '../fsrs/examDate';
import { isAvailable } from '../fsrs/eligibility';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { earlierLessonIds } from './courseEntry';
import { eligiblePracticePool } from './studyPools';

const DEFAULT_CATCH_UP_DAILY_TARGET = 20;

function firstReviewAt(card: Card): number {
  return card.history.reduce((first, review) => Math.min(first, review.timestamp), Infinity);
}

/** A reset retains review evidence and must not spend another unique introduction. */
function isUnseen(card: Card): boolean {
  return (
    card.state === 0 && card.reps === 0 && card.lastReviewed === null && card.history.length === 0
  );
}

export interface CatchUpPracticePacing {
  dailyTarget: number;
  introducedToday: number;
  remainingNewCount: number;
  remainingNewAllowance: number;
  effectiveNewCardsPerDay: number;
}

/**
 * Pace unique introductions across a rolling 24 hours. Reserve half the remaining
 * days, up to the course's urgent-practice window, for subsequent spaced reviews.
 * This is an introduction workload estimate, never a claim of exam readiness.
 * Earlier deadlines constrain only their cumulative coverage, so a small near
 * checkpoint cannot accelerate unrelated later material.
 */
export function catchUpPracticePacing(
  scope: Card[],
  allCards: Card[],
  course: Course,
  examDateContext: ExamDateContext,
  now: number = Date.now(),
): CatchUpPracticePacing {
  const cutoff = now - MS_PER_DAY;
  const introducedRecently = (card: Card) => {
    const first = firstReviewAt(card);
    return first > cutoff && first <= now;
  };
  const uniqueScope = [...new Map(scope.map((card) => [card.id, card])).values()];
  const introduced = uniqueScope.filter(introducedRecently);
  const unseen = uniqueScope.filter((card) => isUnseen(card) && isAvailable(card, now));
  const deadlineCounts = new Map<number, number>();
  for (const card of [...unseen, ...introduced]) {
    const deadline = resolveCardExamDate(card, examDateContext, now);
    if (deadline === undefined || !Number.isFinite(deadline) || deadline <= now) continue;
    deadlineCounts.set(deadline, (deadlineCounts.get(deadline) ?? 0) + 1);
  }
  let dailyTarget = DEFAULT_CATCH_UP_DAILY_TARGET;
  let cumulativeCount = 0;
  for (const [deadline, count] of [...deadlineCounts].sort(([a], [b]) => a - b)) {
    cumulativeCount += count;
    const days = Math.max(1, Math.ceil((deadline - now) / MS_PER_DAY));
    const reserve = Math.min(Math.floor(days / 2), Math.max(0, course.practiceUrgentWindowDays));
    const introductionDays = Math.max(1, days - reserve);
    dailyTarget = Math.max(dailyTarget, Math.ceil(cumulativeCount / introductionDays));
  }
  const allIntroduced = [...new Map(allCards.map((card) => [card.id, card])).values()].filter(
    introducedRecently,
  ).length;
  const nonCatchUpIntroduced = Math.max(0, allIntroduced - introduced.length);
  // Preserve a higher explicit course allowance, but a smaller course cap cannot
  // suppress the adaptive allocation or let today's current lesson consume it.
  const effectiveNewCardsPerDay = Math.max(
    Math.floor(course.newCardsPerDay ?? 0),
    dailyTarget + nonCatchUpIntroduced,
  );
  return {
    dailyTarget,
    introducedToday: introduced.length,
    remainingNewCount: unseen.length,
    remainingNewAllowance: Math.max(0, effectiveNewCardsPerDay - allIntroduced),
    effectiveNewCardsPerDay,
  };
}

/** Earlier knowledge enters real FSRS practice without fabricated teaching evidence. */
export function catchUpPracticePool(
  cards: Card[],
  course: Course,
  lessons: Lesson[],
  links: LessonCardLink[],
  examDateContext: ExamDateContext,
  reachedLessonIds: ReadonlySet<string>,
  now: number = Date.now(),
  priorKnowledgeLessonIds: ReadonlySet<string> = earlierLessonIds(
    course.studyStartLessonId,
    lessons,
    undefined,
    course.schoolCoveredLessonIds,
  ),
  allowExtra = false,
): Card[] {
  const earlier = new Set([...priorKnowledgeLessonIds].filter((id) => reachedLessonIds.has(id)));
  const scope = lessonCardMembershipForLessons(earlier, cards, links);
  const eligible = eligiblePracticePool(scope, course, examDateContext, now);
  if (allowExtra) return eligible;
  const pacing = catchUpPracticePacing(scope, cards, course, examDateContext, now);
  const admitted = new Set(
    eligible
      .filter(isUnseen)
      .map((card) => ({
        card,
        deadline: resolveCardExamDate(card, examDateContext, now) ?? Infinity,
      }))
      .sort((a, b) => a.deadline - b.deadline || a.card.createdAt - b.card.createdAt)
      .slice(0, pacing.remainingNewAllowance)
      .map(({ card }) => card.id),
  );
  return eligible.filter((card) => !isUnseen(card) || admitted.has(card.id));
}
