// Card-management section for LessonView's Edit mode, shown beneath the compact
// LessonCardsList — heading, answer mode, the card list and membership readiness.
// Adding cards of every kind starts from the panel's New card (see CardTypePicker), so
// an empty lesson has nothing to manage here. Extracted from LessonView.tsx alongside
// LessonNotesSection so the page component stays a thin layout/data shell.

import { useState } from 'react';
import { LessonAnswerModeControl } from './AnswerModeControl';
import { CardList } from './CardList';
import { courseCardListContext } from './cardListContext';
import { ConfirmInline } from '../ui/ConfirmInline';
import { useToast } from '../ui/Toast';
import { useLessonCardLinks, useOcclusions, useSequences } from '../../state/useCourseData';
import { db } from '../../db/schema';
import { unlinkCardFromLesson } from '../../db/lessonRepository';
import type { Card, SchedulerConfig } from '../../db/types';
import { PageLoadingBoundary } from '../ui/PageLoadingBoundary';

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
  // A card pending unlink confirmation — only set when it has lesson-specific
  // teaching progress that unlinking would reset (see handleUnlink below).
  const [pendingUnlink, setPendingUnlink] = useState<Card | null>(null);
  const sequences = useSequences(courseId);
  const occlusions = useOcclusions(courseId);
  const links = useLessonCardLinks(lessonId);
  const linkedCardIds = new Set((links ?? []).map((link) => link.cardId));

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

  if (lessonCards.length === 0) return null;

  const heading = (
    <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
      Manage <span className="text-ink-faint">({lessonCards.length})</span>
    </h2>
  );
  const controls = (
    <>
      <LessonAnswerModeControl courseId={courseId} lessonId={lessonId} />

      {pendingUnlink && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-4 py-2.5">
          <span className="text-sm text-ink-soft">Remove card from this lesson?</span>
          <ConfirmInline
            message="Its teaching progress here will be reset."
            confirmLabel="Remove"
            onConfirm={() => void doUnlink(pendingUnlink)}
            onCancel={() => setPendingUnlink(null)}
          />
        </div>
      )}
    </>
  );

  const pending = links === undefined || !lessonSchedulingConfig;

  return (
    <section className={className} aria-label={pending ? 'Loading lesson cards' : undefined}>
      {pending && (
        <>
          <div className="mb-2">{heading}</div>
          {controls}
        </>
      )}
      <PageLoadingBoundary pending={pending}>
        {/* Membership decides whether a row may delete the underlying card. */}
        {pending ? null : (
          <CardList
            courseId={courseId}
            cards={lessonCards}
            context={courseCardListContext({
              schedulingConfig: lessonSchedulingConfig,
              courseId,
              primaryLessonId: lessonId,
              importTargetName: lessonName,
            })}
            heading={heading}
            beforeCards={controls}
            compactMetadata
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
      </PageLoadingBoundary>
    </section>
  );
}
