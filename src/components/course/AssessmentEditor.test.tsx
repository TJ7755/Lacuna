import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Card, Lesson } from '../../db/types';
import {
  AssessmentEditor,
  assessmentDraftIsSaveable,
  emptyAssessmentDraft,
  type AssessmentDraft,
} from './AssessmentEditor';

const lessons: Lesson[] = [
  { id: 'l1', courseId: 'c1', name: 'Atoms', orderIndex: 0, isExtension: false, createdAt: 1 },
  { id: 'l2', courseId: 'c1', name: 'Bonding', orderIndex: 1, isExtension: false, createdAt: 2 },
];

function card(id: string, lessonId: string, front: string): Card {
  return {
    id,
    courseId: 'c1',
    primaryLessonId: lessonId,
    deckId: `deck-${lessonId}`,
    front,
    back: 'Answer',
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
}

const cards = [card('c1', 'l1', 'What is a proton?'), card('c2', 'l2', 'What is a bond?')];

function Harness({ initial = emptyAssessmentDraft(lessons) }: { initial?: AssessmentDraft }) {
  const [draft, setDraft] = useState(initial);
  return (
    <AssessmentEditor
      courseId="c1"
      kind="checkpoint"
      draft={draft}
      onChange={setDraft}
      lessons={lessons}
      cards={cards}
      links={[]}
    />
  );
}

describe('AssessmentEditor', () => {
  it('uses prefix coverage by default and resolves lesson/card counts at the anchor', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Everything so far' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/2 lessons · 2 cards/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Path position'), { target: { value: 'l1' } });
    expect(screen.getByText(/1 lesson · 1 card/)).toBeInTheDocument();
  });

  it('keeps custom coverage explicit and rejects an empty lesson selection', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose lessons' }));
    expect(screen.getByText('Custom assessment coverage must contain at least one lesson.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atoms' }));
    expect(screen.queryByText('Custom assessment coverage must contain at least one lesson.')).not.toBeInTheDocument();
    expect(screen.getByText(/1 lesson · 1 card/)).toBeInTheDocument();
  });

  it('surfaces lessons positioned after the assessment', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Path position'), { target: { value: 'l1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose lessons' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bonding' }));
    expect(screen.getByText('Covered lesson l2 is positioned after the assessment.')).toBeInTheDocument();
  });

  it('shows stale references and keeps the draft unsaveable', () => {
    const initial: AssessmentDraft = {
      ...emptyAssessmentDraft(lessons),
      coverageMode: 'custom',
      lessonIds: ['missing-lesson'],
    };
    render(<Harness initial={initial} />);
    expect(screen.getByText('Covered lesson missing-lesson could not be found.')).toBeInTheDocument();
    expect(
      assessmentDraftIsSaveable('c1', 'checkpoint', initial, lessons, cards, []),
    ).toBe(false);
  });

  it('searches exclusions by covered card and updates the resolved count', () => {
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText('Search covered cards…'), {
      target: { value: 'proton' },
    });
    expect(screen.getByText('What is a proton?')).toBeInTheDocument();
    expect(screen.queryByText('What is a bond?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('What is a proton?'));
    expect(screen.getByText(/2 lessons · 1 card/)).toBeInTheDocument();
  });

  it('requires explicit confirmation for a repaired stale assessment', () => {
    const initial = { ...emptyAssessmentDraft(lessons), needsAuthorConfirmation: true };
    render(<Harness initial={initial} />);
    expect(
      assessmentDraftIsSaveable('c1', 'checkpoint', initial, lessons, cards, []),
    ).toBe(false);
    fireEvent.click(screen.getByLabelText('I have checked this assessment’s placement and scope.'));
    expect(
      screen.queryByLabelText('I have checked this assessment’s placement and scope.'),
    ).not.toBeInTheDocument();
  });
});
