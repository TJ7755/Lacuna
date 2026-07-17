import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Card, CourseAssessment, Lesson } from '../../db/types';
import { AssessmentDetailSheet } from './AssessmentDetailSheet';
import { CheckpointNode } from './CheckpointNode';

const lesson: Lesson = {
  id: 'l1',
  courseId: 'c1',
  name: 'Atoms',
  orderIndex: 0,
  isExtension: false,
  createdAt: 1,
};
const card = {
  id: 'card-1',
  courseId: 'c1',
  primaryLessonId: 'l1',
  deckId: 'd1',
  front: 'What is a proton?',
  back: 'Positive',
  type: 'front_back',
  tags: [],
  createdAt: 1,
  state: 0,
  stability: null,
  difficulty: null,
  due: 0,
  scheduledDays: 0,
  learningSteps: 0,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  history: [],
} as Card;
const assessment: CourseAssessment = {
  id: 'a1',
  courseId: 'c1',
  name: 'Paper 1',
  kind: 'checkpoint',
  examDate: 2_000_000_000_000,
  afterLessonId: 'l1',
  coverageMode: 'prefix',
  excludedCardIds: ['card-1'],
  createdAt: 1,
};

describe('checkpoint assessment details', () => {
  it('opens from an interactive checkpoint node', () => {
    const onClick = vi.fn();
    render(<CheckpointNode assessment={assessment} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open checkpoint: Paper 1' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows identity, resolved scope, exclusions and exact-assessment revision action', () => {
    const onRevise = vi.fn();
    render(
      <AssessmentDetailSheet
        assessment={assessment}
        lessons={[lesson]}
        cards={[card]}
        links={[]}
        onClose={vi.fn()}
        onRevise={onRevise}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Paper 1 details' })).toBeInTheDocument();
    expect(screen.getByText('Atoms')).toBeInTheDocument();
    expect(screen.getByText('What is a proton?')).toBeInTheDocument();
    expect(screen.getByText(/1 lesson · 0 cards/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revise for this assessment' }));
    expect(onRevise).toHaveBeenCalledOnce();
  });
});
