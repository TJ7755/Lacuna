import type { Card, LessonCardLink } from '@lacuna/core/db/types';

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
