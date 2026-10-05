import { useState } from 'react';
import { isLessonAuthoringMode } from '../../course/lessonViewMode';
import { setAuthoredAnswerMode } from '../../db/answerModeRepository';
import type { AnswerMode, Card } from '../../db/types';
import { isTypingEligible } from '../../utils/answerMode';
import { useCourse, useLesson } from '../../state/useCourseData';
import { PillToggleGroup } from './PillToggleGroup';
import { Select } from '../ui/Select';
import { useToast } from '../ui/Toast';

export function AnswerModeChoices({
  value,
  onChange,
  disabled = false,
}: {
  value: AnswerMode;
  onChange: (value: AnswerMode) => void;
  disabled?: boolean;
}) {
  return (
    // A disabled fieldset disables every option while a change saves.
    <fieldset disabled={disabled} className="contents">
      <PillToggleGroup
        label="Lesson answer mode"
        size="sm"
        value={value}
        onChange={onChange}
        options={[
          { value: 'reveal', label: 'Reveal answers' },
          { value: 'type', label: 'Type answers' },
        ]}
      />
    </fieldset>
  );
}

/** A draft field: the editor saves this with the rest of the card. */
export function CardAnswerModeField({
  courseId,
  lessonId,
  value,
  onChange,
}: {
  courseId: string | undefined;
  lessonId: string | undefined;
  value: AnswerMode | undefined;
  onChange: (value: AnswerMode | undefined) => void;
}) {
  const course = useCourse(courseId);
  const lesson = useLesson(lessonId);
  if (!course || course.archived || !isLessonAuthoringMode(course)) return null;
  return (
    <label className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
      Answer by
      <Select
        aria-label="Card answer mode"
        value={value ?? 'inherit'}
        onChange={(event) =>
          onChange(
            event.target.value === 'inherit' ? undefined : (event.target.value as AnswerMode),
          )
        }
      >
        <option value="inherit">
          {lessonId
            ? `Use lesson setting (${lesson?.answerMode === 'type' ? 'Type' : 'Reveal'})`
            : 'Default (Reveal)'}
        </option>
        <option value="reveal">Reveal answer</option>
        <option value="type">Type answer</option>
      </Select>
    </label>
  );
}

export function LessonAnswerModeControl({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const course = useCourse(courseId);
  const lesson = useLesson(lessonId);
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  if (!course || !lesson || course.archived || !isLessonAuthoringMode(course)) return null;
  async function change(answerMode: AnswerMode) {
    setSaving(true);
    try {
      await setAuthoredAnswerMode(courseId, { lessonId }, answerMode);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not change answer mode.', 'negative');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink">Answer by</p>
      <AnswerModeChoices
        value={lesson.answerMode ?? 'reveal'}
        disabled={saving}
        onChange={(mode) => void change(mode)}
      />
    </div>
  );
}

export function SelectedCardsAnswerMode({
  courseId,
  cards,
}: {
  courseId: string | undefined;
  cards: Card[];
}) {
  const course = useCourse(courseId);
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  if (!course || course.archived || !isLessonAuthoringMode(course)) return null;
  const eligible = cards.filter(
    (card) => isTypingEligible(card) && !card.sequenceItemId && !card.occlusionRegionId,
  );
  const values = new Set(eligible.map((card) => card.answerMode ?? 'inherit'));
  const value = values.size === 1 ? [...values][0] : '';
  async function change(value: string) {
    setSaving(true);
    try {
      await setAuthoredAnswerMode(
        course!.id,
        { cardIds: eligible.map((card) => card.id) },
        value === 'inherit' ? undefined : (value as AnswerMode),
      );
      notify('Answer mode updated.', 'positive');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not change answer mode.', 'negative');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Select
      aria-label="Selected cards answer mode"
      value={value}
      disabled={saving || eligible.length === 0}
      onChange={(event) => void change(event.target.value)}
    >
      <option value="" disabled>
        Answer by…
      </option>
      <option value="inherit">Use lesson setting</option>
      <option value="reveal">Reveal answer</option>
      <option value="type">Type answer</option>
    </Select>
  );
}
