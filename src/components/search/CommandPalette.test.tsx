import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';
import type { Card, Course, LegacyDeckRecord, Lesson, Note } from '../../db/types';

const mockDeck: LegacyDeckRecord = {
  id: 'deck-1',
  name: 'Test LegacyDeckRecord',
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  createdAt: Date.now(),
  fsrsVersion: 6,
  fsrsParameters: { requestRetention: 0.9, w: Array(21).fill(0), enable_fuzz: true, maximum_interval: 36500, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] },
  examObjective: 'expectedMarks',
  lastInteractedAt: Date.now(),
};

const mockCourse: Course = {
  id: 'course-1',
  name: 'Course Context',
  description: '',
  createdAt: Date.now(),
  updatedAt: 1,
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  fsrsVersion: 6,
  fsrsParameters: mockDeck.fsrsParameters,
  examObjective: 'expectedMarks',
  unlockMode: 'open',
  autoPractice: false,
  practiceThresholdMinutesFar: 10,
  practiceThresholdMinutesNear: 5,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
};

const mockCard: Card = {
  id: 'card-1',
  deckId: 'deck-1',
  schedulingUnitId: 'deck-1',
  courseId: mockCourse.id,
  primaryLessonId: null,
  type: 'front_back',
  front: 'Palatine hill fortifications',
  back: 'Rome',
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
  createdAt: Date.now(),
  updatedAt: 1,
};

const dataHooks = vi.hoisted(() => ({
  useSearchData: vi.fn(() => ({
    cards: [] as Card[],
    courses: [] as Course[],
    lessons: [] as Lesson[],
    notes: [] as Note[],
  })),
}));

vi.mock('../../state/useSearchData', () => ({
  useSearchData: dataHooks.useSearchData,
}));

describe('CommandPalette', () => {
  beforeEach(() => dataHooks.useSearchData.mockClear());

  it('restores focus to the Search trigger after Escape closes the palette', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const backgroundRef = useRef<HTMLDivElement>(null);

      useEffect(() => {
        if (!open) return;
        const background = backgroundRef.current;
        background?.setAttribute('inert', '');
        return () => background?.removeAttribute('inert');
      }, [open]);

      return (
        <>
          <div ref={backgroundRef}>
            <button type="button" onClick={() => setOpen(true)}>
              Search
            </button>
          </div>
          <CommandPalette open={open} onClose={() => setOpen(false)} />
        </>
      );
    }

    render(<Harness />, { wrapper: MemoryRouter });
    const trigger = screen.getByRole('button', { name: 'Search' });
    trigger.focus();
    fireEvent.click(trigger);
    const input = await screen.findByPlaceholderText(/search courses/i);

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('does not subscribe to whole-database queries while closed', () => {
    render(<CommandPalette open={false} onClose={vi.fn()} />, { wrapper: MemoryRouter });
    expect(dataHooks.useSearchData).not.toHaveBeenCalled();
  });

  it('exposes an open palette as a focus-trapped modal', async () => {
    render(<CommandPalette open onClose={vi.fn()} />, { wrapper: MemoryRouter });
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.style.opacity).toBe('');
    expect(screen.getByPlaceholderText(/search courses/i)).toHaveFocus();
    expect(dataHooks.useSearchData).toHaveBeenCalled();
  });

  it('updates search results without a fixed debounce delay', () => {
    render(<CommandPalette open onClose={vi.fn()} />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'missing' },
    });

    expect(screen.getByText('Nothing matches “missing”.')).toBeInTheDocument();
  });

  afterEach(() => {
    dataHooks.useSearchData.mockReturnValue({ cards: [], courses: [], lessons: [], notes: [] });
  });

  it('badges a sequence-generated card hit', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [{ ...mockCard, sequenceItemId: 'item-1' }],
      courses: [mockCourse],
      lessons: [],
      notes: [],
    });
    render(<CommandPalette open onClose={vi.fn()} />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'Palatine' },
    });

    expect(screen.getByText('Sequence')).toBeInTheDocument();
  });

  it('uses the Course name for a course card without a backing LegacyDeckRecord row', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [{ ...mockCard, deckId: 'missing-deck', courseId: mockCourse.id }],
      courses: [mockCourse],
      lessons: [],
      notes: [],
    });
    render(<CommandPalette open onClose={vi.fn()} />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'Course Context' },
    });

    expect(screen.getAllByText('Course Context')).toHaveLength(2);
  });

  it('badges an occlusion-generated card hit', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [{ ...mockCard, occlusionRegionId: 'region-1' }],
      courses: [mockCourse],
      lessons: [],
      notes: [],
    });
    render(<CommandPalette open onClose={vi.fn()} />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'Palatine' },
    });

    expect(screen.getByText('Occlusion')).toBeInTheDocument();
  });

  it('exposes combobox accessibility attributes on the input', async () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [mockCard],
      courses: [mockCourse],
      lessons: [],
      notes: [],
    });
    render(<CommandPalette open onClose={vi.fn()} />, { wrapper: MemoryRouter });

    const input = screen.getByPlaceholderText(/search courses/i);
    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-controls', 'palette-listbox');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    // No results yet (empty query) -> collapsed and no active descendant
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.change(input, { target: { value: 'Palatine' } });
    // After search, listbox appears, expanded true, active descendant points to first option
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', 'palette-option-0');

    const listbox = await screen.findByRole('listbox');
    expect(listbox).toHaveAttribute('id', 'palette-listbox');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAttribute('id', 'palette-option-0');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    act(() => {
      flushSync(() => {
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        valueSetter?.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(input).not.toHaveAttribute('aria-activedescendant');
    });

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('updates aria-activedescendant and aria-selected on keyboard navigation', async () => {
    const secondCard: Card = { ...mockCard, id: 'card-2', front: 'Palatine second' };
    dataHooks.useSearchData.mockReturnValue({
      cards: [mockCard, secondCard],
      courses: [mockCourse],
      lessons: [],
      notes: [],
    });
    render(<CommandPalette open onClose={vi.fn()} />, { wrapper: MemoryRouter });

    const input = screen.getByPlaceholderText(/search courses/i);
    fireEvent.change(input, { target: { value: 'Palatine' } });

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
    expect(input).toHaveAttribute('aria-activedescendant', 'palette-option-0');

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // After navigation, second option selected
    const updatedOptions = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', 'palette-option-1');
    expect(updatedOptions[0]).toHaveAttribute('aria-selected', 'false');
    expect(updatedOptions[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('announces result count in a polite live region', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [mockCard],
      courses: [mockCourse],
      lessons: [],
      notes: [],
    });
    render(<CommandPalette open onClose={vi.fn()} />, { wrapper: MemoryRouter });

    const liveRegion = document.querySelector('[aria-live="polite"].sr-only');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    expect(liveRegion?.textContent).toMatch(/Type to search/);

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'Palatine' },
    });
    expect(liveRegion?.textContent).toMatch(/1 result available/);

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'missing' },
    });
    expect(liveRegion?.textContent).toMatch(/No results for missing/);
  });
});
