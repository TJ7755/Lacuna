// Card-list section for LessonView — demoted heading, empty state, and the
// resolving-deck skeleton. Extracted from LessonView.tsx alongside
// LessonNotesSection so the page component stays a thin layout/data shell.

import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { CardList } from './CardList';
import { courseCardListContext } from './cardListContext';
import { LinkCardsDialog } from './LinkCardsDialog';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';
import { PlusIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import {
  useCourseCards,
  useLessonBackingDeck,
  useLessonCardLinks,
  useLessons,
  useOcclusions,
  useSequences,
} from '../../state/useCourseData';
import { db } from '../../db/schema';
import { ensureLessonBackingDeck } from '../../db/backingDecks';
import { unlinkCardFromLesson } from '../../db/repository';
import type { Card, SchedulerConfig } from '../../db/types';

interface LessonCardsSectionProps {
  courseId: string;
  lessonId: string;
  /** Used only to label the back-link when the sequence editor is opened from here
   *  (see the onEditSequence origin override below). */
  lessonName: string;
  lessonCards: Card[];
  lessonSchedulingConfig: SchedulerConfig | undefined;
  onNavigate: (path: string, options?: { state?: unknown }) => void;
  className?: string;
}

export function LessonCardsSection({
  courseId,
  lessonId,
  lessonName,
  lessonCards,
  lessonSchedulingConfig,
  onNavigate,
  className,
}: LessonCardsSectionProps) {
  const { notify } = useToast();
  const [linking, setLinking] = useState(false);
  const [importReadyFor, setImportReadyFor] = useState<string>();
  const preparedDeck = useLessonBackingDeck(courseId, lessonId);
  const importKey = `${courseId}:${lessonId}`;
  // A card pending unlink confirmation — only set when it has lesson-specific
  // teaching progress that unlinking would reset (see handleUnlink below).
  const [pendingUnlink, setPendingUnlink] = useState<Card | null>(null);
  const sequences = useSequences(courseId);
  const occlusions = useOcclusions(courseId);
  const courseCards = useCourseCards(courseId);
  const lessons = useLessons(courseId);
  const links = useLessonCardLinks(lessonId);
  const linkedCardIds = new Set((links ?? []).map((link) => link.cardId));
  const lessonCardIds = new Set(lessonCards.map((card) => card.id));
  const linkCandidates = (courseCards ?? []).filter(
    (card) =>
      !lessonCardIds.has(card.id) &&
      (card.sequenceItemId === null || card.sequenceItemId === undefined) &&
      (card.occlusionRegionId === null || card.occlusionRegionId === undefined),
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

  async function prepareEmptyImport() {
    try {
      await ensureLessonBackingDeck(courseId, lessonId);
      setImportReadyFor(importKey);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not prepare the card import.',
        'negative',
      );
    }
  }

  return (
    <section className={className}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl text-ink-soft">
          Cards <span className="text-ink-faint">({lessonCards.length})</span>
        </h2>
        {lessonCards.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/occlusion/new`)}
          >
            <PlusIcon width={16} height={16} />
            New occlusion
          </Button>
        )}
      </div>

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

      {lessonCards.length === 0 && importReadyFor === importKey && preparedDeck ? (
        <CardList
          cards={[]}
          context={courseCardListContext({
            schedulingConfig: preparedDeck,
            courseId,
            primaryLessonId: lessonId,
            importTargetName: lessonName,
          })}
          hideHeader
          initiallyImporting
          onNewCard={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)}
          onNewSequence={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/sequence/new`)}
          onNewOcclusion={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/occlusion/new`)}
          onLinkExisting={() => setLinking(true)}
          onEditCard={(card) =>
            onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/${card.id}/edit`)
          }
        />
      ) : lessonCards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong py-12 text-center">
          <p className="mb-4 text-sm text-ink-soft">No cards in this lesson yet.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)}
            >
              <PlusIcon width={18} height={18} />
              New card
            </Button>
            <Button
              variant="secondary"
              onClick={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/sequence/new`)}
            >
              <PlusIcon width={18} height={18} />
              New sequence
            </Button>
            <Button
              variant="secondary"
              onClick={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/occlusion/new`)}
            >
              <PlusIcon width={18} height={18} />
              New occlusion
            </Button>
            <Button variant="secondary" onClick={() => setLinking(true)}>
              <PlusIcon width={18} height={18} />
              Link existing cards
            </Button>
            <Button variant="secondary" onClick={() => void prepareEmptyImport()}>
              Import cards
            </Button>
          </div>
        </div>
      ) : links === undefined || !lessonSchedulingConfig ? (
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
          context={courseCardListContext({
            schedulingConfig: lessonSchedulingConfig,
            courseId,
            primaryLessonId: lessonId,
            importTargetName: lessonName,
          })}
          hideHeader
          onNewCard={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)}
          onNewSequence={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/sequence/new`)}
          onNewOcclusion={() => onNavigate(`/course/${courseId}/lesson/${lessonId}/occlusion/new`)}
          onLinkExisting={() => setLinking(true)}
          onEditCard={(card) =>
            onNavigate(`/course/${courseId}/lesson/${lessonId}/cards/${card.id}/edit`)
          }
          linkedCardIds={linkedCardIds}
          onUnlinkCard={(card) => void handleUnlink(card)}
          sequences={sequences}
          onEditSequence={(sequenceId) =>
            // Sequence editing has no lesson-scoped edit route, so without an
            // explicit origin the editor would default to Cards —
            // override it to return here instead.
            onNavigate(`/course/${courseId}/sequence/${sequenceId}/edit`, {
              state: {
                origin: { path: `/course/${courseId}/lesson/${lessonId}`, label: lessonName },
              },
            })
          }
          occlusions={occlusions}
          onEditOcclusion={(occlusionId) =>
            // Mirrors onEditSequence above: occlusion editing has no lesson-scoped edit
            // route either, so override the origin to return here instead.
            onNavigate(`/course/${courseId}/occlusion/${occlusionId}/edit`, {
              state: {
                origin: { path: `/course/${courseId}/lesson/${lessonId}`, label: lessonName },
              },
            })
          }
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
