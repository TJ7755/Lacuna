import { useRef, useState } from 'react';
import { recordUsageAction } from '../../usage/actions';
import { canEditLessons, isLessonAuthoringMode } from '../../course/lessonViewMode';
import { useToast } from '../../components/ui/Toast';
import {
  createLessonCard,
  createLessonCardWithReverse,
  createLessonBasicReversedPair,
  createCourseCard,
  createCourseCardWithReverse,
  createCourseBasicReversedPair,
  saveCardEdit,
} from '../../db/cardRepository';
import type { Card, CardType, Course } from '@lacuna/core/db/types';
import { buildStructuredCardPayload, validateCardContent } from '../../items/cardAuthoring';
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
  returnTo: Pick<ReturnTarget, 'goBack'>;
}) {
  const {
    type,
    answerMode,
    requireCorrectSpelling,
    front,
    back,
    numericAnswer,
    numericFixtures,
    workingCompilation,
    workingFixtures,
    tags,
    alsoReverse,
  } = draft.values;
  const {
    setFront,
    setBack,
    setNumericAnswer,
    setNumericFixtures,
    setWorkingSource,
    setWorkingFixtures,
  } = draft.setters;
  const editing = draft.editing;
  const lessonMode = Boolean(lessonId);
  const { notify } = useToast();
  // Quick-capture bookkeeping: how many cards added without leaving the page, and a
  // remount key that refocuses the first field after each "Save & add another".
  const [addedCount, setAddedCount] = useState(0);
  const [formKey, setFormKey] = useState(0);

  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
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
  const content = validateCardContent({ type, front, back, numericAnswer, workingCompilation });
  const { backValid, clozeValid, numericValid, workingValid, backValue } = content;
  const frontValid = content.frontValid && (!isAudio || isAudioCardFront(front));
  const editable = Boolean(course && canEditLessons(course));
  const canConfigureSpelling = editable && !course?.archived && !isStructured;
  const canSave =
    editable &&
    !draft.draftPrompt &&
    !mediaBusy &&
    frontValid &&
    backValid &&
    clozeValid &&
    numericValid &&
    workingValid;
  const canReverse = !editing && !isCloze && !isBasicReversed && !isStructured && !isAudio;
  // Front / back and Basic (reversed) share a form; every other type has its own.
  const formKind = isBasicReversed ? 'front_back' : type;

  async function handleSave(andAnother = false) {
    if (!editable || savingRef.current || mediaBusy || draft.draftPrompt) return;
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
      const storedSpelling = canConfigureSpelling ? requireCorrectSpelling : undefined;
      const storedType: CardType = isStructured || isAudio ? 'front_back' : type;
      const payload = buildStructuredCardPayload(
        isNumeric
          ? {
              kind: 'numeric',
              answer: numericAnswer,
              fixtures: numericFixtures.length ? numericFixtures : undefined,
            }
          : isWorking
            ? {
                kind: 'working',
                compilation: workingCompilation,
                fixtures: workingFixtures.length ? workingFixtures : undefined,
              }
            : undefined,
      );
      if (editing && card) {
        await saveCardEdit(card.id, {
          type: storedType,
          front,
          back: backValue,
          tags,
          payload,
          answerMode: storedAnswerMode,
          ...(canConfigureSpelling || isStructured
            ? { requireCorrectSpelling: storedSpelling }
            : {}),
        });
        recordUsageAction('edit-saved');
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
            storedSpelling,
          );
        } else if (reversed) {
          await createLessonCardWithReverse(
            courseId!,
            lessonId!,
            front,
            backValue,
            tags,
            storedAnswerMode,
            storedSpelling,
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
            storedSpelling,
          );
        }
      } else if (isBasicReversed) {
        await createCourseBasicReversedPair(
          courseId!,
          front,
          backValue,
          tags,
          storedAnswerMode,
          storedSpelling,
        );
      } else if (reversed) {
        await createCourseCardWithReverse(
          courseId!,
          front,
          backValue,
          tags,
          storedAnswerMode,
          storedSpelling,
        );
      } else {
        await createCourseCard(
          courseId!,
          storedType,
          front,
          backValue,
          tags,
          payload,
          storedAnswerMode,
          storedSpelling,
        );
      }
      recordUsageAction('create-completed');
      draft.clearSavedDraft();
      if (andAnother) {
        // Stay on the page for rapid entry: clear the content, keep the type and tags
        // (usually shared across a batch), refocus the first field, and tally the count.
        setFront('');
        setBack('');
        if (isNumeric) {
          setNumericAnswer(EMPTY_NUMERIC_ANSWER);
          setNumericFixtures([]);
        }
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
    setMediaBusy,
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
    canConfigureSpelling,
    formKind,
  };
}

export type CardEditorSave = ReturnType<typeof useCardEditorSave>;
