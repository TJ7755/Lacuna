import { act, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardEditOverlay } from './CardEditOverlay';
import type { Card } from '@lacuna/core/db/types';

const mockUpdateCard = vi.fn();

vi.mock('../../db/cardRepository', () => ({
  updateCard: (...args: unknown[]) => mockUpdateCard(...args),
}));

vi.mock('../markdown/MarkdownEditor', () => ({
  MarkdownEditor: ({
    inputRef,
    label,
    value,
    onChange,
    clozePreview,
  }: {
    inputRef?: React.RefObject<HTMLTextAreaElement>;
    label: string;
    value: string;
    onChange: (value: string) => void;
    clozePreview?: 'front' | 'back';
  }) => (
    <label>
      {label}
      <textarea
        ref={inputRef}
        value={value}
        data-cloze-preview={clozePreview}
        onChange={(event) => onChange(event.target.value)}
      />
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

describe('CardEditOverlay type picker', () => {
  it('picks the card type with the full editor pill track and swaps the fields with it', () => {
    const { getByRole, getByLabelText, queryByLabelText } = render(
      <CardEditOverlay card={card} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    const group = getByRole('group', { name: 'Card type' });
    expect(within(group).getByRole('button', { name: 'Front / back' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: 'Cloze deletion' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(within(group).getByRole('button', { name: 'Cloze deletion' }));

    expect(within(group).getByRole('button', { name: 'Cloze deletion' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(getByLabelText('Text (use the Cloze button to hide answers)')).toHaveValue('Front');
    expect(queryByLabelText('Back')).not.toBeInTheDocument();
  });
});

describe('CardEditOverlay draft scope', () => {
  it('switches the cloze preview between the prompt and the revealed answer', () => {
    const { getByRole, getByLabelText } = render(
      <CardEditOverlay
        card={{ ...card, type: 'cloze', front: 'Water is {{c1::H2O}}.' }}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const control = getByRole('switch', { name: 'Preview revealed answer' });
    expect(getByLabelText('Text (use the Cloze button to hide answers)')).toHaveAttribute(
      'data-cloze-preview',
      'front',
    );
    fireEvent.click(control);
    expect(control).toBeChecked();
    expect(getByLabelText('Text (use the Cloze button to hide answers)')).toHaveAttribute(
      'data-cloze-preview',
      'back',
    );
  });
  it('wraps focus between the save and close controls', () => {
    const { getByRole } = render(
      <CardEditOverlay card={card} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    const close = getByRole('button', { name: 'Close editor' });
    const save = getByRole('button', { name: 'Save changes' });
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(save);
  });

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
