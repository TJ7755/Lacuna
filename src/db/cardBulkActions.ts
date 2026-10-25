import { stampUpdatedAt } from './mutationStamp';
import { applyScheduleEdit, mergeScheduleEdits } from './scheduleEdits';
import { db } from './schema';
import type { ScheduleEdit } from './types';

/** Withhold a card from all study and from progress/objective until un-suspended. */
export async function suspendCard(id: string): Promise<void> {
  await db.cards.update(id, stampUpdatedAt({ suspended: true }));
}

/** Return a suspended card to normal scheduling. */
export async function unsuspendCard(id: string): Promise<void> {
  await db.cards.update(id, stampUpdatedAt({ suspended: false }));
}

/** Suspend or un-suspend many cards at once (used by the card list's bulk actions). */
export async function setCardsSuspended(ids: string[], suspended: boolean): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    await db.cards.where('id').anyOf(ids).modify(stampUpdatedAt({ suspended }));
  });
}

/** Add a tag to many cards at once, leaving cards that already have it untouched. */
export async function addTagToCards(ids: string[], tag: string): Promise<void> {
  const clean = tag.trim();
  if (!clean) return;
  const now = Date.now();
  await db.transaction('rw', db.cards, async () => {
    await db.cards
      .where('id')
      .anyOf(ids)
      .modify((card) => {
        const tags = card.tags ?? [];
        if (!tags.includes(clean)) card.tags = [...tags, clean];
        card.updatedAt = stampUpdatedAt(card, now).updatedAt;
      });
  });
}

/** Remove a tag from many cards at once. */
export async function removeTagFromCards(ids: string[], tag: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.cards, async () => {
    await db.cards
      .where('id')
      .anyOf(ids)
      .modify((card) => {
        if (card.tags?.length) card.tags = card.tags.filter((t) => t !== tag);
        card.updatedAt = stampUpdatedAt(card, now).updatedAt;
      });
  });
}

/** Skip a card until the given instant (defaults to the caller-supplied next midnight). */
export async function buryCard(id: string, until: number): Promise<void> {
  await db.cards.update(id, stampUpdatedAt({ buriedUntil: until }));
}

/** Skip many cards until the given instant. */
export async function buryCards(ids: string[], until: number): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    await db.cards
      .where('id')
      .anyOf(ids)
      .modify(stampUpdatedAt({ buriedUntil: until }));
  });
}

export interface RescheduleOptions {
  /** Reset selected cards to the New state, clearing all scheduling data. */
  reset?: boolean;
  /** Set a specific due date (epoch ms). Takes precedence over reset. */
  due?: number;
}

/**
 * Bulk-reschedule cards: either reset them to New (clearing stability, difficulty,
 * due, etc.) or set a custom due date. History is preserved in both cases.
 */
export async function rescheduleCards(ids: string[], options: RescheduleOptions): Promise<void> {
  if (options.due === undefined && !options.reset) {
    throw new Error('Reschedule requires either reset: true or a due date.');
  }
  const now = Date.now();
  const edit: ScheduleEdit =
    options.due !== undefined
      ? { at: now, kind: 'due', due: options.due }
      : { at: now, kind: 'reset' };
  await db.transaction('rw', db.cards, async () => {
    await db.cards
      .where('id')
      .anyOf(ids)
      .modify((card) => {
        Object.assign(card, applyScheduleEdit(card, edit), {
          buriedUntil: null,
          scheduleEdits: mergeScheduleEdits(card.scheduleEdits, [edit]),
        });
        card.updatedAt = stampUpdatedAt(card, now).updatedAt;
      });
  });
}

/** Set or clear a card's flag (a user marker for quick filtering and follow-up). */
export async function setCardFlag(id: string, flagged: boolean): Promise<void> {
  await db.cards.update(id, stampUpdatedAt({ flagged }));
}
