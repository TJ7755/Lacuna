import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card, Course, Lesson } from '../../db/types';
import {
  CardAnswerModeField,
  LessonAnswerModeControl,
  SelectedCardsAnswerMode,
} from './AnswerModeControl';

const save = vi.fn().mockResolvedValue(undefined);
let course: Pick<Course, 'id' | 'lessonViewMode' | 'archived' | 'distributedCopy'>;
let lesson: Pick<Lesson, 'id' | 'answerMode'>;
vi.mock('../../state/useCourseData', () => ({ useCourse: () => course, useLesson: () => lesson }));
vi.mock('../../db/answerModeRepository', () => ({
  setAuthoredAnswerMode: (...args: unknown[]) => save(...args),
}));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
beforeEach(() => {
  course = { id: 'course', lessonViewMode: 'edit' };
  lesson = { id: 'lesson', answerMode: 'type' };
  save.mockClear();
});

describe('answer-mode author controls', () => {
  it('shows the inherited mode and allows an explicit reveal or inheritance', () => {
    const change = vi.fn();
    render(
      <CardAnswerModeField
        courseId="course"
        lessonId="lesson"
        value={undefined}
        onChange={change}
      />,
    );
    expect(screen.getByRole('option', { name: 'Use lesson setting (Type)' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Card answer mode' }), {
      target: { value: 'reveal' },
    });
    expect(change).toHaveBeenLastCalledWith('reveal');
    fireEvent.change(screen.getByRole('combobox', { name: 'Card answer mode' }), {
      target: { value: 'inherit' },
    });
    expect(change).toHaveBeenLastCalledWith(undefined);
  });

  it('changes the lesson default with one click', async () => {
    render(<LessonAnswerModeControl courseId="course" lessonId="lesson" />);
    expect(screen.getByRole('button', { name: 'Type answers' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answers' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith('course', { lessonId: 'lesson' }, 'reveal'),
    );
  });

  it('changes selected ordinary cards together and skips numeric items', async () => {
    const cards = [
      { id: 'text', type: 'front_back' },
      {
        id: 'numeric',
        type: 'front_back',
        payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
      },
    ] as Card[];
    render(<SelectedCardsAnswerMode courseId="course" cards={cards} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Selected cards answer mode' }), {
      target: { value: 'type' },
    });
    await waitFor(() => expect(save).toHaveBeenCalledWith('course', { cardIds: ['text'] }, 'type'));
  });

  it.each(['study', 'locked', 'archived'] as const)(
    'hides all author controls for %s courses',
    (mode) => {
      if (mode === 'study') course.lessonViewMode = 'study';
      if (mode === 'archived') course.archived = true;
      if (mode === 'locked') course.distributedCopy = { locked: true } as Course['distributedCopy'];
      render(
        <>
          <CardAnswerModeField
            courseId="course"
            lessonId="lesson"
            value={undefined}
            onChange={vi.fn()}
          />
          <LessonAnswerModeControl courseId="course" lessonId="lesson" />
          <SelectedCardsAnswerMode courseId="course" cards={[]} />
        </>,
      );
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );
});
