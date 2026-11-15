import { useState, type ComponentProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { LessonAnswerModeControl } from './AnswerModeControl';
import { CardList } from './CardList';
import { courseCardListContext } from './cardListContext';
import { ConfirmInline } from '../ui/ConfirmInline';
import { ExpandingCreateControl } from '../ui/ExpandingCreateControl';
import { useToast } from '../ui/Toast';
import { db } from '../../db/schema';
import { unlinkCardFromLesson } from '../../db/lessonRepository';
import type { Card, SchedulerConfig } from '@lacuna/core/db/types';

/** The complete document shares the existing bulk actions and lesson-membership safeguards. */
export function LessonCardsSection({
  courseId,
  lessonId,
  lessonName,
  lessonCards,
  lessonSchedulingConfig,
  linkedCardIds,
  renderCards,
}: {
  courseId: string;
  lessonId: string;
  lessonName: string;
  lessonCards: Card[];
  lessonSchedulingConfig: SchedulerConfig;
  linkedCardIds: ReadonlySet<string>;
  renderCards: NonNullable<ComponentProps<typeof CardList>['renderCards']>;
}) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [pendingUnlink, setPendingUnlink] = useState<Card | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    <CardList
      courseId={courseId}
      cards={lessonCards}
      context={courseCardListContext({
        schedulingConfig: lessonSchedulingConfig,
        courseId,
        primaryLessonId: lessonId,
        importTargetName: lessonName,
      })}
      heading={
        <ExpandingCreateControl
          label="Lesson settings"
          closedWidth={160}
          expandedWidth={400}
          showIcon={false}
          align="start"
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        >
          <div className="p-5">
            <LessonAnswerModeControl courseId={courseId} lessonId={lessonId} />
          </div>
        </ExpandingCreateControl>
      }
      beforeCards={
        pendingUnlink && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-4 py-2.5">
            <span className="text-sm text-ink-soft">Remove card from this lesson?</span>
            <ConfirmInline
              message="Its teaching progress here will be reset."
              confirmLabel="Remove"
              onConfirm={() => void doUnlink(pendingUnlink)}
              onCancel={() => setPendingUnlink(null)}
            />
          </div>
        )
      }
      onEditCard={(card) =>
        void navigate(`/course/${courseId}/lesson/${lessonId}/cards/${card.id}/edit`)
      }
      linkedCardIds={linkedCardIds}
      onUnlinkCard={(card) => void handleUnlink(card)}
      renderCards={renderCards}
    />
  );
}
