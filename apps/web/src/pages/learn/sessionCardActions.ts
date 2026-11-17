import { liveQuery, type Subscription } from 'dexie';
import type { Card } from '@lacuna/core/db/types';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { canEditLessons } from '../../course/lessonViewMode';
import { buryCard, setCardFlag, suspendCard } from '../../db/cardRepository';
import { db } from '../../db/schema';
import { startOfDay } from '../../utils/datetime';
import type { Phase } from './types';

interface CardActionEnvironment {
  read(): {
    current: Card | null;
    cards: Card[];
    phase: Phase;
    mounted: boolean;
    generation: number;
  };
  advanceTimer(event: { type: 'pause' | 'resume'; now: number }): void;
  removed(card: Card): void;
  edited(card: Card, queuedPartner?: Card, storedPartner?: Card): void;
  flagged(card: Card): void;
  notify(message: string): void;
  publish(): void;
}

/**
 * Owns edit permission, editor timing and acknowledgement of card actions.
 * Session reconciliation runs before the editor closes and publishes its snapshot.
 */
export class SessionCardActions {
  constructor(private environment: CardActionEnvironment) {}

  editing = false;

  reset = () => {
    this.editing = false;
  };

  dispose = () => {
    this.editPermissionSubscription?.unsubscribe();
    this.editPermissionSubscription = undefined;
  };

  canEditCurrent = false;
  private editPermissionSubscription: Subscription | undefined;
  watchPermission = () => {
    this.editPermissionSubscription?.unsubscribe();
    this.editPermissionSubscription = undefined;
    this.canEditCurrent = false;
    const card = this.environment.read().current;
    if (!card || card.sequenceItemId !== undefined || card.occlusionRegionId !== undefined) return;
    const generation = this.environment.read().generation;
    this.editPermissionSubscription = liveQuery(async () => {
      const course = card.courseId ? await db.courses.get(card.courseId) : undefined;
      return card.courseId ? Boolean(course && canEditLessons(course)) : true;
    }).subscribe((editable) => {
      if (
        !this.environment.read().mounted ||
        generation !== this.environment.read().generation ||
        this.environment.read().current?.id !== card.id
      )
        return;
      this.canEditCurrent = editable;
      this.environment.publish();
    });
  };

  suspendCurrent = async () => {
    const { current: card, generation, mounted } = this.environment.read();
    if (!mounted || !card) return;
    try {
      await suspendCard(card.id);
      if (!this.environment.read().mounted || generation !== this.environment.read().generation)
        return;
      this.environment.removed({ ...card, suspended: true });
    } catch (err) {
      if (!this.environment.read().mounted || generation !== this.environment.read().generation)
        return;
      this.environment.notify(err instanceof Error ? err.message : 'Could not suspend the card.');
    }
  };

  buryCurrent = async () => {
    const { current: card, generation, mounted } = this.environment.read();
    if (!mounted || !card) return;
    try {
      const until = startOfDay(Date.now()) + MS_PER_DAY;
      await buryCard(card.id, until);
      if (!this.environment.read().mounted || generation !== this.environment.read().generation)
        return;
      this.environment.removed({ ...card, buriedUntil: until });
    } catch (err) {
      if (!this.environment.read().mounted || generation !== this.environment.read().generation)
        return;
      this.environment.notify(err instanceof Error ? err.message : 'Could not bury the card.');
    }
  };

  openEdit = () => {
    const { current, cards, phase } = this.environment.read();
    if (!current || !this.canEditCurrent) return;
    // Guard against the card having been removed from the session pool
    // (deleted / suspended by another tab) since the last render.
    if (!cards.some((card) => card.id === current.id)) return;
    // Only the question phase has a running timer; the answer phase already
    // captured responseTime at reveal, so there is nothing to pause there.
    if (phase === 'question') {
      this.environment.advanceTimer({ type: 'pause', now: performance.now() });
    }
    this.editing = true;
    this.environment.publish();
  };

  private resumeAfterEdit = () => {
    if (this.environment.read().phase === 'question') {
      this.environment.advanceTimer({ type: 'resume', now: performance.now() });
    }
  };

  cancelEdit = () => {
    this.editing = false;
    this.resumeAfterEdit();
    this.environment.publish();
  };

  handleEdited = async (updated: Card) => {
    const { generation, mounted, current, cards } = this.environment.read();
    if (!mounted || current?.id !== updated.id) return;
    const previous = cards.find((card) => card.id === updated.id);
    const partnerId = previous?.reverseCardId ?? updated.reverseCardId;
    const queuedPartner = cards.find((card) => card.id === partnerId);
    const storedPartner = queuedPartner ? await db.cards.get(queuedPartner.id) : undefined;
    if (
      !this.environment.read().mounted ||
      generation !== this.environment.read().generation ||
      this.environment.read().current?.id !== updated.id
    )
      return;
    this.environment.edited(updated, queuedPartner, storedPartner);
    this.editing = false;
    this.resumeAfterEdit();
    this.environment.publish();
  };

  toggleFlagCurrent = async () => {
    const { current: card, generation, mounted } = this.environment.read();
    if (!mounted || !card) return;
    try {
      const next = !card.flagged;
      await setCardFlag(card.id, next);
      if (!this.environment.read().mounted || generation !== this.environment.read().generation)
        return;
      const updated = { ...card, flagged: next };
      this.environment.flagged(updated);
      this.environment.publish();
    } catch (err) {
      if (!this.environment.read().mounted || generation !== this.environment.read().generation)
        return;
      this.environment.notify(
        err instanceof Error ? err.message : 'Could not update the card flag.',
      );
    }
  };

  get editTagSuggestions() {
    const { current, cards } = this.environment.read();
    return this.editing && current
      ? [
          ...new Set(
            cards
              .filter((card) => card.schedulingUnitId === current.schedulingUnitId)
              .flatMap((c) => c.tags ?? []),
          ),
        ].sort()
      : [];
  }
}
