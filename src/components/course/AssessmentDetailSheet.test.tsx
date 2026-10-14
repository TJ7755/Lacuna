import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Card, CourseAssessment, Lesson } from '../../db/types';
import { AssessmentDetailSheet, assessmentSheetTiming } from './AssessmentDetailSheet';
import { CheckpointNode } from './CheckpointNode';
import { MemoryRouter } from 'react-router-dom';

const lesson: Lesson = {
  id: 'l1',
  courseId: 'c1',
  name: 'Atoms',
  orderIndex: 0,
  isExtension: false,
  createdAt: 1,
  updatedAt: 1,
};
const card = {
  id: 'card-1',
  conceptId: 'concept-card-1',
  courseId: 'c1',
  primaryLessonId: 'l1',
  deckId: 'd1',
  schedulingUnitId: 'd1',
  front: 'What is a proton?',
  back: 'Positive',
  type: 'front_back',
  tags: [],
  createdAt: 1,
  updatedAt: 1,
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
  updatedAt: 1,
};

describe('checkpoint assessment details', () => {
  it('wraps focus within the sheet in both directions', () => {
    render(
      <MemoryRouter>
        <AssessmentDetailSheet
          assessment={{ ...assessment, excludedCardIds: [] }}
          lessons={[lesson]}
          cards={[card]}
          links={[]}
          onClose={vi.fn()}
          onRevise={vi.fn()}
        />
      </MemoryRouter>,
    );
    const close = screen.getByRole('button', { name: 'Close assessment details' });
    const revise = screen.getByRole('button', { name: 'Revise for Paper 1' });
    expect(revise).toBeEnabled();
    revise.focus();
    fireEvent.keyDown(revise, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(revise);
  });
  it('scales sheet motion and disables durations for reduced motion', () => {
    expect(assessmentSheetTiming(1.4).sheet.duration).toBeCloseTo(0.336);
    expect(assessmentSheetTiming(0.6).backdrop.duration).toBeCloseTo(0.096);
    expect(assessmentSheetTiming(0).sheet.duration).toBe(0);
  });

  it('opens from an interactive checkpoint node', () => {
    const onClick = vi.fn();
    render(<CheckpointNode assessment={assessment} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open checkpoint: Paper 1' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows identity, resolved scope, exclusions and exact-assessment revision action', () => {
    const onRevise = vi.fn();
    render(
      <MemoryRouter>
        <AssessmentDetailSheet
          assessment={assessment}
          lessons={[lesson]}
          cards={[card]}
          links={[]}
          onClose={vi.fn()}
          onRevise={onRevise}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('dialog', { name: 'Paper 1 details' })).toBeInTheDocument();
    expect(screen.getByText('Atoms')).toBeInTheDocument();
    expect(screen.getByText('What is a proton?')).toBeInTheDocument();
    expect(screen.getByText(/1 lesson · 0 cards/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revise for Paper 1' }));
    expect(onRevise).toHaveBeenCalledOnce();
  });
});
