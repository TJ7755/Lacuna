import { useState } from 'react';
import { isLessonAuthoringMode } from '../../course/lessonViewMode';
import { setAuthoredAnswerMode } from '../../db/answerModeRepository';
import type { AnswerMode, Card } from '@lacuna/core/db/types';
import { isTypingEligible } from '../../utils/answerMode';
import { useCourse, useLesson } from '../../state/useCourseData';
import { SegmentedPills } from '../ui/SegmentedPills';
import { Select } from '../ui/Select';
import { useToast } from '../ui/Toast';

/** A draft field: the editor saves this with the rest of the card. */
export function CardAnswerModeField({
  courseId,
  value,
  onChange,
}: {
  courseId: string | undefined;
  value: AnswerMode | undefined;
  onChange: (value: AnswerMode | undefined) => void;
}) {
  const course = useCourse(courseId);
  if (!course || course.archived || !isLessonAuthoringMode(course)) return null;
  return (
    <label className="flex min-w-0 flex-col gap-2 text-sm font-semibold text-ink">
      <span>Answer by</span>
      <Select
        aria-label="Card answer mode"
        className="w-full min-w-0"
        value={value ?? 'inherit'}
        onChange={(event) =>
          onChange(
            event.target.value === 'inherit' ? undefined : (event.target.value as AnswerMode),
          )
        }
      >
        <option value="inherit">Lesson default</option>
        <option value="reveal">Reveal only</option>
        <option value="type">Suggest typing</option>
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
    <fieldset aria-busy={saving} aria-disabled={saving || undefined} className="min-w-0">
      <legend className="mb-3 text-sm text-ink">Suggested answer mode</legend>
      <SegmentedPills
        label="Suggested answer mode"
        size="sm"
        value={lesson.answerMode ?? 'reveal'}
        onChange={(mode) => {
          if (!saving) void change(mode);
        }}
        options={[
          { value: 'reveal', label: 'Reveal', ariaLabel: 'Reveal answers' },
          { value: 'type', label: 'Type', ariaLabel: 'Type answers' },
        ]}
      />
    </fieldset>
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
      <option value="inherit">Lesson default</option>
      <option value="reveal">Reveal only</option>
      <option value="type">Suggest typing</option>
    </Select>
  );
}
