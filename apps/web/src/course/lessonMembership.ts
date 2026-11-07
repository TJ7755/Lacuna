import type { Card, Lesson, LessonCardLink } from '@lacuna/core/db/types';

/** Core course cards include unassigned cards and exclude primary extension membership. */
export function coreCourseCards(cards: Card[], extensionLessonIds: ReadonlySet<string>): Card[] {
  return cards.filter(
    ({ primaryLessonId }) =>
      primaryLessonId === null ||
      primaryLessonId === undefined ||
      !extensionLessonIds.has(primaryLessonId),
  );
}

/** Index all requested lessons in one pass over the cards and their explicit links. */
export function lessonCardMembershipByLesson(
  lessons: readonly Pick<Lesson, 'id'>[],
  cards: readonly Card[],
  links: readonly LessonCardLink[],
): Map<string, Card[]> {
  const membership = new Map<string, Card[]>(lessons.map(({ id }) => [id, []]));
  if (membership.size === 0) return membership;
  const linksByCard = new Map<string, Set<string>>();
  for (const { lessonId, cardId } of links) {
    if (!membership.has(lessonId)) continue;
    let linked = linksByCard.get(cardId);
    if (!linked) {
      linked = new Set();
      linksByCard.set(cardId, linked);
    }
    linked.add(lessonId);
  }
  // Iterate cards rather than links to keep the existing input order within each lesson.
  for (const card of cards) {
    const primary = card.primaryLessonId;
    if (primary !== null && primary !== undefined) membership.get(primary)?.push(card);
    const linked = linksByCard.get(card.id);
    if (!linked) continue;
    for (const lessonId of linked) {
      if (lessonId !== primary) membership.get(lessonId)?.push(card);
    }
  }
  return membership;
}

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
