// Card-list section for LessonView — demoted heading, empty state, and the
// resolving-deck skeleton. Extracted from LessonView.tsx alongside
// LessonNotesSection so the page component stays a thin layout/data shell.

import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { CardList } from './CardList';
import { LinkCardsDialog } from './LinkCardsDialog';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';
import { PlusIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import {
  useCourseCards,
  useLessonCardLinks,
  useLessons,
  useSequences,
} from '../../state/useCourseData';
import { db } from '../../db/schema';
import { unlinkCardFromLesson } from '../../db/repository';
import type { Card, Deck } from '../../db/types';

interface LessonCardsSectionProps {
  courseId: string;
  lessonId: string;
  lessonCards: Card[];
  lessonDeck: Deck | undefined;
  onNavigate: (path: string) => void;
  className?: string;
}

export function LessonCardsSection({
  courseId,
  lessonId,
  lessonCards,
  lessonDeck,
  onNavigate,
  className,
}: LessonCardsSectionProps) {
  const { notify } = useToast();
  const [linking, setLinking] = useState(false);
  // A card pending unlink confirmation — only set when it has lesson-specific
  // teaching progress that unlinking would reset (see handleUnlink below).
  const [pendingUnlink, setPendingUnlink] = useState<Card | null>(null);
  const sequences = useSequences(courseId);
  const courseCards = useCourseCards(courseId);
  const lessons = useLessons(courseId);
  const links = useLessonCardLinks(lessonId);
  const linkedCardIds = new Set((links ?? []).map((link) => link.cardId));
  const lessonCardIds = new Set(lessonCards.map((card) => card.id));
  const linkCandidates = (courseCards ?? []).filter(
    (card) =>
      !lessonCardIds.has(card.id) &&
      (card.sequenceItemId === null || card.sequenceItemId === undefined),
  );

  async function handleUnlink(card: Card) {
    const exposure = await db.lessonCardExposures.get([lessonId, card.id]);
    if (exposure) {
      setPendingUnlink(card);
      return;
    }
    await doUnlink(card);
  }

  async function doUnlink(card: Card) {
    try {
      await unlinkCardFromLesson(lessonId, card.id);
      notify('Card removed from this lesson.', 'neutral');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not remove the card.', 'negative');
    } finally {
      setPendingUnlink(null);
    }
  }

  return (
    <section className={className}>
      <h2 className="mb-4 font-display text-xl text-ink-soft">
        Cards <span className="text-ink-faint">({lessonCards.length})</span>
      </h2>

      {pendingUnlink && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5">
          <span className="text-sm text-ink-soft">Remove card from this lesson?</span>
          <ConfirmInline
            message="Its teaching progress here will be reset."
            confirmLabel="Remove"
            onConfirm={() => void doUnlink(pendingUnlink)}
            onCancel={() => setPendingUnlink(null)}
          />
        </div>
      )}

      {lessonCards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong py-12 text-center">
          <p className="mb-4 text-sm text-ink-soft">No cards in this lesson yet.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)}
            >
              <PlusIcon width={18} height={18} />
              Add your first card
            </Button>
            <Button
              variant="secondary"
              onClick={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/sequence/new`)}
            >
              <PlusIcon width={18} height={18} />
              Add a sequence
            </Button>
            <Button variant="secondary" onClick={() => setLinking(true)}>
              <PlusIcon width={18} height={18} />
              Link existing cards
            </Button>
          </div>
        </div>
      ) : links === undefined || !lessonDeck ? (
        // Membership determines whether a row may delete the underlying card. Never
        // render destructive controls until that membership query has resolved.
        <div className="space-y-3" aria-label="Loading lesson cards">
          {Array.from({ length: Math.min(lessonCards.length, 3) }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-line bg-ink/5" />
          ))}
        </div>
      ) : (
        <CardList
          cards={lessonCards}
          deck={lessonDeck}
          allDecks={[lessonDeck]}
          hideHeader
          onNewCard={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)}
          onNewSequence={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/sequence/new`)}
          onLinkExisting={() => setLinking(true)}
          onEditCard={(card) => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/${card.id}/edit`)}
          linkedCardIds={linkedCardIds}
          onUnlinkCard={(card) => void handleUnlink(card)}
          sequences={sequences}
          onEditSequence={(sequenceId) => onNavigate(`/course/${courseId}/sequence/${sequenceId}/edit`)}
        />
      )}
      <AnimatePresence>
        {linking && courseCards && lessons && (
          <LinkCardsDialog
            lessonId={lessonId}
            cards={linkCandidates}
            lessons={lessons}
            onLinked={() => setLinking(false)}
            onCancel={() => setLinking(false)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
