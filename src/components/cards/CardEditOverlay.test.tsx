import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardEditOverlay } from './CardEditOverlay';
import type { Card } from '../../db/types';

const mockUpdateCard = vi.fn();

vi.mock('../../db/repository', () => ({
  updateCard: (...args: unknown[]) => mockUpdateCard(...args),
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

vi.mock('../markdown/MarkdownEditor', () => ({
  MarkdownEditor: ({
    inputRef,
    label,
    value,
    onChange,
  }: {
    inputRef?: React.RefObject<HTMLTextAreaElement>;
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <label>
      {label}
      <textarea ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  ),
}));

vi.mock('../ui/TagInput', () => ({
  TagInput: () => <div />,
}));

vi.mock('../ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

vi.mock('../ui/icons', () => ({
  CloseIcon: () => <span aria-hidden="true" />,
}));

const card: Card = {
  id: 'card-1',
  conceptId: 'concept-card-1',
  deckId: 'deck-1',
  schedulingUnitId: 'unit-1',
  type: 'front_back',
  front: 'Front',
  back: 'Back',
  stability: null,
  difficulty: null,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  state: 0,
  due: null,
  scheduledDays: 0,
  learningSteps: 0,
  history: [],
  createdAt: 1,
  updatedAt: 1,
  tags: [],
  suspended: false,
  buriedUntil: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mockUpdateCard.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CardEditOverlay draft scope', () => {
  it('uses the explicit Course/Lesson scope instead of the card Deck', async () => {
    render(
      <CardEditOverlay card={card} draftScope="lesson-1" onSaved={vi.fn()} onCancel={vi.fn()} />,
    );

    await act(() => vi.advanceTimersByTime(800));

    expect(localStorage.getItem('lacuna:draft:lesson-1:session:card-1')).not.toBeNull();
    expect(localStorage.getItem('lacuna:draft:deck-1:session:card-1')).toBeNull();
  });

  it('uses the card scheduling unit when no explicit scope is supplied', async () => {
    const { getByLabelText } = render(
      <CardEditOverlay card={card} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.change(getByLabelText('Front'), { target: { value: 'Updated front' } });
    await act(() => vi.advanceTimersByTime(800));

    expect(localStorage.getItem('lacuna:draft:unit-1:session:card-1')).not.toBeNull();
  });
});
