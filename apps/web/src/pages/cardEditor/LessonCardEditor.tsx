import { useEffect } from 'react';
import type { Card, Course } from '@lacuna/core/db/types';
import { Button } from '../../components/ui/Button';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { draftKey } from '../../utils/drafts';
import { CardAuthoringFields } from './CardAuthoringFields';
import { useCardEditorDraft } from './useCardEditorDraft';
import { useCardEditorFocus } from './useCardEditorFocus';
import { useCardEditorSave } from './useCardEditorSave';

/** The existing authoring and draft lifecycle, hosted by the card's expanding Edit action. */
export function LessonCardEditor({
  card,
  course,
  lessonId,
  onClose,
}: {
  card: Card;
  course: Course;
  lessonId: string;
  onClose: () => void;
}) {
  const draft = useCardEditorDraft({
    currentDraftKey: draftKey(lessonId, card.id),
    editing: true,
    card,
  });
  const save = useCardEditorSave({
    draft,
    card,
    course,
    courseId: course.id,
    lessonId,
    returnTo: {
      goBack: onClose,
    },
  });
  const focus = useCardEditorFocus(draft.values.type, save.shakeField, save.shakeNonce);
  const [speed] = useMotionSpeed();
  useEffect(() => {
    if (draft.loaded && !draft.draftPrompt) {
      const target =
        draft.values.type === 'audio' ? focus.audioEntryRef.current : focus.frontRef.current;
      target?.focus({ preventScroll: true });
    }
  }, [draft.loaded, draft.draftPrompt, draft.values.type, focus.frontRef, focus.audioEntryRef]);

  return (
    <div
      className="flex flex-col gap-4 p-5"
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing) return;
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          if (!draft.draftPrompt) void save.handleSave();
        }
      }}
    >
      {draft.draftPrompt ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-soft">You have an unsaved draft.</p>
          <Button variant="ghost" onClick={draft.discardDraft}>
            Discard
          </Button>
          <Button onClick={draft.applyDraft}>Restore draft</Button>
        </div>
      ) : draft.loaded ? (
        <>
          <CardAuthoringFields
            embedded
            draft={draft}
            focus={focus}
            save={save}
            editing
            courseId={course.id}
            previewSide="front"
            tagSuggestions={card.tags ?? []}
            m={speedMultiplier(speed)}
          />
          <div className="flex items-center justify-end gap-2">
            <span role="status" className="mr-auto text-sm text-ink-soft">
              {save.showSaved ? 'Saved' : ''}
            </span>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              ref={focus.saveRef}
              disabled={!save.canSave || save.saving}
              onClick={() => void save.handleSave()}
            >
              Save changes
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
