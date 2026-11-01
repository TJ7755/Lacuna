import { useRef, useState } from 'react';
import { canEditLessons, isLessonAuthoringMode } from '../../course/lessonViewMode';
import { useToast } from '../../components/ui/Toast';
import { numericAnswerSpecIsValid } from '../../components/items/NumericAnswerEditor';
import {
  createLessonCard,
  createLessonCardWithReverse,
  createLessonBasicReversedPair,
  createCourseCard,
  createCourseCardWithReverse,
  createCourseBasicReversedPair,
  updateCard,
} from '../../db/cardRepository';
import type { Card, CardType, Course, ItemPayload } from '@lacuna/core/db/types';
import { hasCloze } from '../../utils/cloze';
import { isAudioCardFront } from '../../media/audio';
import type { ReturnTarget } from '../../utils/editorOrigin';
import { useCardSaveConfirmation } from '../useCardSaveConfirmation';
import { EMPTY_NUMERIC_ANSWER, type CardEditorDraft } from './useCardEditorDraft';

export function useCardEditorSave({
  draft,
  course,
  card,
  courseId,
  lessonId,
  returnTo,
}: {
  draft: CardEditorDraft;
  course: Course | null | undefined;
  card: Card | null | undefined;
  courseId: string | undefined;
  lessonId: string | undefined;
  returnTo: ReturnTarget;
}) {
  const {
    type,
    answerMode,
    front,
    back,
    numericAnswer,
    workingCompilation,
    workingFixtures,
    tags,
    alsoReverse,
  } = draft.values;
  const { setFront, setBack, setNumericAnswer, setWorkingSource, setWorkingFixtures } =
    draft.setters;
  const editing = draft.editing;
  const lessonMode = Boolean(lessonId);
  const { notify } = useToast();
  // Quick-capture bookkeeping: how many cards added without leaving the page, and a
  // remount key that refocuses the first field after each "Save & add another".
  const [addedCount, setAddedCount] = useState(0);
  const [formKey, setFormKey] = useState(0);

  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const { showSaved, flashSaved, afterSaved } = useCardSaveConfirmation(draft.currentDraftKey);
  const [shakeField, setShakeField] = useState<string | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0);
  const shakeTimer = useRef<number | undefined>(undefined);
  const isCloze = type === 'cloze';
  const isBasicReversed = type === 'basic_reversed';
  const isNumeric = type === 'numeric';
  const isWorking = type === 'working';
  const isAudio = type === 'audio';
  const isStructured = isNumeric || isWorking;
  const workingValid =
    !isWorking ||
    (workingCompilation.lines.length > 0 &&
      workingCompilation.lines.every((line) => line.kind === 'compiled'));
  const clozeValid = !isCloze || hasCloze(front);
  const frontValid = front.trim().length > 0 && (!isAudio || isAudioCardFront(front));
  const backValid = isCloze || isStructured || back.trim().length > 0;
  const numericValid = !isNumeric || numericAnswerSpecIsValid(numericAnswer);
  const editable = Boolean(course && canEditLessons(course));
  const canSave = editable && frontValid && backValid && clozeValid && numericValid && workingValid;
  const canReverse = !editing && !isCloze && !isBasicReversed && !isStructured && !isAudio;
  // Front / back and Basic (reversed) share a form; every other type has its own.
  const formKind = isBasicReversed ? 'front_back' : type;

  async function handleSave(andAnother = false) {
    if (!editable || savingRef.current) return;
    const missingOwner = lessonMode ? !courseId || !lessonId : !courseId;
    if (!canSave || missingOwner) {
      // Shake the first invalid field to give the user tactile feedback on why save is blocked.
      const field = !frontValid
        ? 'front'
        : !numericValid
          ? 'answer'
          : !workingValid
            ? 'scheme'
            : !backValid
              ? 'back'
              : 'cloze';
      setShakeField(field);
      notify(
        field === 'answer'
          ? 'Enter at least one valid numeric answer without variables.'
          : field === 'scheme'
            ? 'Enter a valid mark scheme.'
            : field === 'back'
              ? 'Enter an answer.'
              : field === 'cloze'
                ? 'Add at least one cloze deletion.'
                : isAudio
                  ? 'Choose or record an audio clip.'
                  : 'Enter a question or prompt.',
        'negative',
      );
      setShakeNonce((n) => n + 1);
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShakeField(null), 500);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const storedAnswerMode =
        course && !course.archived && isLessonAuthoringMode(course)
          ? isStructured
            ? undefined
            : answerMode
          : editing
            ? card?.answerMode
            : undefined;
      const storedType: CardType = isStructured || isAudio ? 'front_back' : type;
      const backValue = isCloze || isStructured ? '' : back;
      const payload: ItemPayload | undefined = isNumeric
        ? { v: 1, kind: 'numeric', answer: numericAnswer }
        : isWorking
          ? {
              v: 1,
              kind: 'working',
              scheme: workingCompilation.lines.flatMap((line) =>
                line.kind === 'compiled' ? [line.value] : [],
              ),
              ...(workingFixtures.length > 0 ? { fixtures: workingFixtures } : {}),
            }
          : undefined;
      if (editing && card) {
        await updateCard(card.id, {
          type: storedType,
          front,
          back: backValue,
          tags,
          payload,
          answerMode: storedAnswerMode,
        });
        // If this is a basic_reversed card, update its reverse partner too.
        if (card.type === 'basic_reversed' && card.reverseCardId) {
          await updateCard(card.reverseCardId, { front: backValue, back: front });
        }
        draft.clearSavedDraft();
        flashSaved();
        // Let the confirmation flourish play briefly before leaving the page.
        afterSaved(() => {
          notify('Card updated.', 'positive');
          returnTo.goBack();
        });
        return;
      }

      const reversed = !isCloze && !isBasicReversed && !isStructured && !isAudio && alsoReverse;
      if (lessonMode) {
        if (isBasicReversed) {
          await createLessonBasicReversedPair(
            courseId!,
            lessonId!,
            front,
            backValue,
            tags,
            storedAnswerMode,
          );
        } else if (reversed) {
          await createLessonCardWithReverse(
            courseId!,
            lessonId!,
            front,
            backValue,
            tags,
            storedAnswerMode,
          );
        } else {
          await createLessonCard(
            courseId!,
            lessonId!,
            storedType,
            front,
            backValue,
            tags,
            payload,
            storedAnswerMode,
          );
        }
      } else if (isBasicReversed) {
        await createCourseBasicReversedPair(courseId!, front, backValue, tags, storedAnswerMode);
      } else if (reversed) {
        await createCourseCardWithReverse(courseId!, front, backValue, tags, storedAnswerMode);
      } else {
        await createCourseCard(
          courseId!,
          storedType,
          front,
          backValue,
          tags,
          payload,
          storedAnswerMode,
        );
      }
      draft.clearSavedDraft();
      if (andAnother) {
        // Stay on the page for rapid entry: clear the content, keep the type and tags
        // (usually shared across a batch), refocus the first field, and tally the count.
        setFront('');
        setBack('');
        if (isNumeric) setNumericAnswer(EMPTY_NUMERIC_ANSWER);
        if (isWorking) setWorkingSource('');
        if (isWorking) setWorkingFixtures([]);
        setAddedCount((n) => n + (reversed ? 2 : 1));
        setFormKey((k) => k + 1);
        flashSaved();
      } else {
        flashSaved();
        afterSaved(() => {
          notify(reversed ? 'Card and its reverse added.' : 'Card added.', 'positive');
          returnTo.goBack();
        });
      }
      if (andAnother) {
        savingRef.current = false;
        setSaving(false);
      }
    } catch {
      savingRef.current = false;
      setSaving(false);
      notify('Could not save the card. Try again.', 'negative');
    }
  }

  return {
    handleSave,
    saving,
    addedCount,
    formKey,
    showSaved,
    shakeField,
    shakeNonce,
    isCloze,
    isBasicReversed,
    isNumeric,
    isWorking,
    isAudio,
    isStructured,
    clozeValid,
    canSave,
    canReverse,
    formKind,
  };
}

export type CardEditorSave = ReturnType<typeof useCardEditorSave>;
