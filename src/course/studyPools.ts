// Pure card-pool construction for course lessons and practice nodes.
//
// Lesson links affect where a card can be taught and when it becomes reachable,
// but never mutate the card's primary lesson or its single FSRS memory state.

import type { Card, Course, LessonCardExposure, LessonCardLink, PracticeNode } from '../db/types';
import type { ExamDateContext } from '../fsrs/examDate';
import { rAtExam } from '../fsrs/forwardSim';
import { decayOf } from '../fsrs/fsrs';
import { cardSchedulingHorizon } from '../fsrs/horizon';
import { isAvailable } from '../fsrs/eligibility';
import { isLeech } from '../fsrs/leech';
import { MASTERY_R } from '../fsrs/params';

/** Primary and explicitly linked cards for one lesson, deduplicated by card id. */
export function lessonCardMembership(
  lessonId: string,
  cards: Card[],
  links: LessonCardLink[],
): Card[] {
  return lessonCardMembershipForLessons(new Set([lessonId]), cards, links);
}

/** Effective card membership across several lessons, deduplicated by card id. */
export function lessonCardMembershipForLessons(
  lessonIds: ReadonlySet<string>,
  cards: Card[],
  links: LessonCardLink[],
): Card[] {
  const linkedIds = new Set(
    links.filter((link) => lessonIds.has(link.lessonId)).map((link) => link.cardId),
  );
  return cards.filter(
    (card) =>
      (card.primaryLessonId !== null &&
        card.primaryLessonId !== undefined &&
        lessonIds.has(card.primaryLessonId)) ||
      linkedIds.has(card.id),
  );
}

/** Cards still needing a successful introduction in this particular lesson. */
export function lessonStudyPool(
  lessonId: string,
  cards: Card[],
  links: LessonCardLink[],
  exposures: LessonCardExposure[],
): Card[] {
  const exposedIds = new Set(
    exposures
      .filter((exposure) => exposure.lessonId === lessonId)
      .map((exposure) => exposure.cardId),
  );
  return lessonCardMembership(lessonId, cards, links).filter((card) => !exposedIds.has(card.id));
}

export interface PracticeScopeOptions {
  /** Reached lessons only. An open but untouched lesson must not leak unseen cards. */
  reachedLessonIds: ReadonlySet<string>;
  /** Optional authored configuration. Auto practice omits this. */
  practiceNode?: PracticeNode;
}

function cardMatchesFilter(
  card: Card,
  filter: NonNullable<PracticeNode['filters']>[number],
  now: number,
  leechThreshold?: number,
): boolean {
  switch (filter) {
    case 'due':
      return card.due !== null && card.due !== undefined && card.due <= now;
    case 'new':
      return card.state === 0;
    case 'leech':
      return isLeech(card, leechThreshold);
    case 'flagged':
      return card.flagged === true;
    case 'suspended':
      return card.suspended === true;
  }
}

/** Small deterministic hash used for stable ordering and compact scope versions. */
function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

function deterministicRandomOrder(cards: Card[], seed: string): Card[] {
  return [...cards].sort((left, right) => {
    const leftHash = hash(`${seed}\0${left.id}`);
    const rightHash = hash(`${seed}\0${right.id}`);
    return leftHash.localeCompare(rightHash) || left.id.localeCompare(right.id);
  });
}

/**
 * Full effective scope for a practice node before availability and mastery are
 * applied. A card must belong to a reached lesson and have been exposed in at
 * least one lesson. Manual lesson scopes, filters, randomisation and limits are
 * applied here so the resulting milestone denominator is stable.
 */
export function practiceCardScope(
  cards: Card[],
  links: LessonCardLink[],
  exposures: LessonCardExposure[],
  options: PracticeScopeOptions,
  now: number = Date.now(),
  leechThreshold?: number,
): Card[] {
  const exposedIds = new Set(exposures.map((exposure) => exposure.cardId));
  const selectedLessonIds = options.practiceNode?.lessonIds
    ? new Set(
        options.practiceNode.lessonIds.filter((lessonId) => options.reachedLessonIds.has(lessonId)),
      )
    : options.reachedLessonIds;

  const linkedLessonsByCard = new Map<string, Set<string>>();
  for (const link of links) {
    const lessonIds = linkedLessonsByCard.get(link.cardId) ?? new Set<string>();
    lessonIds.add(link.lessonId);
    linkedLessonsByCard.set(link.cardId, lessonIds);
  }

  let scope = cards.filter((card) => {
    if (!exposedIds.has(card.id)) return false;
    if (card.primaryLessonId && selectedLessonIds.has(card.primaryLessonId)) return true;
    const linkedLessonIds = linkedLessonsByCard.get(card.id);
    return linkedLessonIds
      ? [...linkedLessonIds].some((lessonId) => selectedLessonIds.has(lessonId))
      : false;
  });

  const filters = options.practiceNode?.filters ?? [];
  if (filters.length > 0) {
    scope = scope.filter((card) =>
      filters.every((filter) => cardMatchesFilter(card, filter, now, leechThreshold)),
    );
  }

  if (options.practiceNode?.randomize) {
    scope = deterministicRandomOrder(scope, options.practiceNode.id);
  }

  const cardCount = Math.floor(options.practiceNode?.cardCount ?? 0);
  return cardCount > 0 ? scope.slice(0, cardCount) : scope;
}

/** Cards in the node scope which still fall below mastery at their own horizon. */
export function eligiblePracticePool(
  scope: Card[],
  course: Course,
  examDateContext: ExamDateContext,
  now: number = Date.now(),
): Card[] {
  if (course.archived) return [];
  const decay = decayOf(course.fsrsParameters);
  return scope.filter((card) => {
    if (!isAvailable(card, now)) return false;
    const horizon = cardSchedulingHorizon(card, course, examDateContext, now);
    return rAtExam(card, horizon, now, decay) < MASTERY_R;
  });
}

export interface PracticeReadiness {
  securedCardCount: number;
  totalCardCount: number;
  fraction: number;
}

/**
 * Current readiness across the node's full effective scope. Availability is
 * deliberately irrelevant: suspended or buried cards remain part of what the
 * milestone represents, even though they cannot enter today's session.
 */
export function practiceReadiness(
  scope: Card[],
  course: Course,
  examDateContext: ExamDateContext,
  now: number = Date.now(),
): PracticeReadiness {
  const decay = decayOf(course.fsrsParameters);
  const securedCardCount = scope.reduce((count, card) => {
    const horizon = cardSchedulingHorizon(card, course, examDateContext, now);
    return count + (rAtExam(card, horizon, now, decay) >= MASTERY_R ? 1 : 0);
  }, 0);
  return {
    securedCardCount,
    totalCardCount: scope.length,
    fraction: scope.length === 0 ? 0 : securedCardCount / scope.length,
  };
}

/** Stable key persisted for a manual or computed auto practice milestone. */
export function practiceNodeKey(
  courseId: string,
  node: Pick<PracticeNode, 'id' | 'type'> | undefined,
  afterLessonId: string | null,
): string {
  if (node?.type === 'manual') return node.id;
  return `practice-auto-${courseId}-${afterLessonId ?? 'start'}`;
}

/** Fingerprint of the effective card ids represented by a milestone. */
export function practiceScopeVersion(scope: Card[]): string {
  const ids = [...new Set(scope.map((card) => card.id))].sort();
  const serialisedIds = ids.map((id) => `${id.length}:${id}`).join('|');
  return `v1-${ids.length}-${hash(serialisedIds)}`;
}
