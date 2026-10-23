import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SearchPage } from './SearchPage';
import { useRef } from 'react';
import type * as React from 'react';
import { useScrollMemory } from '../components/layout/scrollMemory';
import { Outlet } from 'react-router-dom';
import type { Card, Course, LegacyDeckRecord, Lesson, Note } from '../db/types';
import type { FixedQuestionDefinition, QuestionDefinition } from '../questions/types';

const deferredQueryState = vi.hoisted(() => ({ held: false }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof React>('react');
  return {
    ...actual,
    useDeferredValue: <T,>(value: T) => {
      const deferred = actual.useDeferredValue(value);
      return deferredQueryState.held ? '' : deferred;
    },
  };
});

const mockDeck: LegacyDeckRecord = {
  id: 'deck-1',
  name: 'Test LegacyDeckRecord',
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  createdAt: Date.now(),
  fsrsVersion: 6,
  fsrsParameters: {
    requestRetention: 0.9,
    w: Array(21).fill(0),
    enable_fuzz: true,
    maximum_interval: 36500,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  },
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
  conceptId: 'concept-card-1',
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

const mockQuestion: FixedQuestionDefinition = {
  id: 'question-1',
  courseId: mockCourse.id,
  primaryLessonId: null,
  additionalLessonIds: [],
  name: 'Energy transfer application',
  tags: ['mechanics'],
  suspended: false,
  kind: 'fixed',
  prompt: 'Calculate the final velocity.',
  payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
  explanation: 'Equate the initial and final energy.',
  explanationStatus: 'authored',
  contentVersion: 1,
  contentRevisionId: 'content-revision-1',
  authoringRevisionId: 'authoring-revision-1',
  authoringUpdatedAt: 1,
  stability: null,
  difficulty: null,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  state: 0,
  due: null,
  scheduledDays: 0,
  learningSteps: 0,
  scheduleEpoch: { id: 'epoch-1', startedAt: 1, reason: 'created', baseline: { kind: 'new' } },
  scheduleUpdatedAt: 1,
  createdAt: 1,
  updatedAt: 1,
};

const dataHooks = vi.hoisted(() => ({
  useSearchData: vi.fn(() => ({
    cards: [] as Card[],
    courses: [] as Course[],
    lessons: [] as Lesson[],
    notes: [] as Note[],
    questions: [] as QuestionDefinition[],
  })),
}));

function SearchShell() {
  const main = useRef<HTMLElement>(null);
  useScrollMemory(main);
  return (
    <main ref={main}>
      <Outlet />
    </main>
  );
}

vi.mock('../state/useSearchData', () => ({
  useSearchData: dataHooks.useSearchData,
}));

describe('SearchPage', () => {
  it('uses the restored query before a deferred update can insert unrelated rows on Back', async () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [
        ...Array.from({ length: 18 }, (_, i) => ({
          ...mockCard,
          id: `unrelated-${i}`,
          front: `Earlier unrelated ${i}`,
        })),
        ...Array.from({ length: 100 }, (_, i) => ({
          ...mockCard,
          id: `match-${i}`,
          front: `Palatine ${String(i).padStart(3, '0')}`,
        })),
      ],
      courses: [mockCourse],
      lessons: [],
      notes: [],
      questions: [],
    });
    // A pending route can retain SearchPage with the editor's empty query. Hold
    // that deferred value across Back to expose the intermediate unfiltered list.
    deferredQueryState.held = true;
    try {
      const router = createMemoryRouter([{ path: '*', element: <SearchPage /> }], {
        initialEntries: [
          '/search?q=Palatine&filter=new&shown=160',
          '/course/course-1/cards/match-80/edit',
        ],
      });
      render(<RouterProvider router={router} />);
      await act(() => router.navigate(-1));
      expect(screen.getByRole('combobox')).toHaveValue('Palatine');
      expect(screen.getAllByRole('option')).toHaveLength(100);
      expect(screen.queryByRole('option', { name: /Earlier unrelated/ })).not.toBeInTheDocument();
      expect(screen.getAllByRole('option')[0]).toHaveTextContent('Palatine 000');
    } finally {
      deferredQueryState.held = false;
    }
  });

  it('shows ranked Help results, caps them at three and opens their topic', () => {
    const router = createMemoryRouter([{ path: '*', element: <SearchPage /> }], {
      initialEntries: ['/search?q=swipe'],
    });
    render(<RouterProvider router={router} />);
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
    const gesture = screen.getByRole('option', { name: /How do I study with touch gestures/ });
    expect(gesture).toHaveTextContent('Help · Studying');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(router.state.location.pathname).toBe('/help');
    expect(router.state.location.hash).toBe('#touch-gestures');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'exam' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent(/How do I (set an exam date|revise before an exam)/);
  });

  it('navigates highlighted results from the field whilst leaving filters in normal keyboard access', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [mockCard, { ...mockCard, id: 'card-2', front: 'Palatine second' }],
      courses: [mockCourse],
      lessons: [],
      notes: [],
      questions: [],
    });
    const router = createMemoryRouter([{ path: '*', element: <SearchPage /> }], {
      initialEntries: ['/search'],
    });
    render(<RouterProvider router={router} />);
    const input = screen.getByRole('combobox', { name: 'Search content' });
    fireEvent.change(input, { target: { value: 'Palatine' } });
    expect(input).toHaveAttribute('role', 'combobox');
    expect(screen.getByRole('listbox')).toHaveAttribute('id', input.getAttribute('aria-controls'));
    const options = screen.getAllByRole('option');
    expect(options[0].querySelector('mark')).toHaveTextContent('Palatine');
    expect(screen.getByRole('status')).toHaveTextContent('2 results');
    expect(screen.getByRole('button', { name: 'Due now' })).not.toHaveAttribute('tabindex', '-1');
    const scroll = vi.spyOn(options[1], 'scrollIntoView').mockImplementation(() => {});
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveFocus();
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'instant' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(router.state.location.pathname).toBe('/course/course-1/cards/card-2/edit');
    scroll.mockRestore();
  });

  it('opens the hovered result with Enter whilst the field keeps focus', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [mockCard, { ...mockCard, id: 'card-2', front: 'Palatine second' }],
      courses: [mockCourse],
      lessons: [],
      notes: [],
      questions: [],
    });
    const router = createMemoryRouter([{ path: '*', element: <SearchPage /> }], {
      initialEntries: ['/search?q=Palatine'],
    });
    render(<RouterProvider router={router} />);
    const input = screen.getByRole('combobox');
    const second = screen.getAllByRole('option')[1];
    fireEvent.mouseEnter(second);
    expect(input).toHaveFocus();
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', second.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(router.state.location.pathname).toBe('/course/course-1/cards/card-2/edit');
  });

  it('clears only filters and retains the query', () => {
    const router = createMemoryRouter([{ path: '*', element: <SearchPage /> }], {
      initialEntries: ['/search?q=Palatine&filter=flagged&shown=160'],
    });
    render(<RouterProvider router={router} />);
    const clear = screen.getByRole('button', { name: 'Clear' });
    expect(clear.parentElement).not.toContainElement(
      screen.getByRole('button', { name: 'Flagged' }),
    );
    fireEvent.click(clear);
    expect(screen.getByRole('combobox')).toHaveValue('Palatine');
    expect(router.state.location.search).toBe('?q=Palatine');
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('preserves query and card filters when returning from a result and Escape edits the query', async () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [{ ...mockCard, flagged: true }],
      courses: [mockCourse],
      lessons: [],
      notes: [],
      questions: [],
    });
    const router = createMemoryRouter(
      [
        {
          element: <SearchShell />,
          children: [
            { path: '/search', element: <SearchPage /> },
            { path: '*', element: <p>Editor</p> },
          ],
        },
      ],
      { initialEntries: ['/search?q=Palatine&filter=flagged'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('combobox', { name: 'Search content' })).toHaveValue('Palatine');
    expect(screen.getByRole('button', { name: 'Flagged' })).toHaveAttribute('aria-pressed', 'true');
    const option = screen.getByRole('option');
    option.focus();
    fireEvent.keyDown(option, { key: 'Escape' });
    expect(screen.getByRole('combobox', { name: 'Search content' })).toHaveFocus();
    const main = screen.getByRole('main');
    main.scrollTo = ((options: ScrollToOptions) => {
      main.scrollTop = options.top ?? 0;
    }) as typeof main.scrollTo;
    main.scrollTop = 320;
    fireEvent.scroll(main);
    fireEvent.click(option);
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(main.scrollTop).toBe(0);
    await act(() => router.navigate(-1));
    expect(main.scrollTop).toBe(320);
    expect(screen.getByRole('combobox', { name: 'Search content' })).toHaveValue('Palatine');
    expect(screen.getByRole('button', { name: 'Flagged' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('option')).toBeInTheDocument();
  });

  it('bounds a broad list and extends it when the keyboard reaches the shown results', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: Array.from({ length: 100 }, (_, i) => ({
        ...mockCard,
        id: `card-${i}`,
        front: `Palatine ${i}`,
      })),
      courses: [mockCourse],
      lessons: [],
      notes: [],
      questions: [],
    });
    render(<SearchPage />, { wrapper: MemoryRouter });
    const input = screen.getByRole('combobox', { name: 'Search content' });
    fireEvent.change(input, { target: { value: 'Palatine' } });
    expect(screen.getAllByRole('option')).toHaveLength(80);
    expect(screen.getByRole('status')).toHaveTextContent('80 of 100 results');
    const scrolled: Element[] = [];
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(function (this: Element) {
        scrolled.push(this);
      });
    for (let i = 0; i < 80; i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')).toHaveLength(100);
    expect(screen.getAllByRole('option')[80]).toHaveAttribute('aria-selected', 'true');
    // The newly shown row is scrolled to once it renders, not skipped.
    expect(scrolled.at(-1)).toBe(screen.getAllByRole('option')[80]);
    scrollIntoView.mockRestore();
    fireEvent.change(input, { target: { value: 'missing' } });
    expect(screen.getByRole('status')).toHaveTextContent('No results');
    expect(input).not.toHaveAttribute('aria-activedescendant');
  }, 15_000);

  it('shows a diacritic-insensitive match beyond the beginning of a long answer', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [{ ...mockCard, back: `${'Long explanation. '.repeat(30)}Résumé conclusion.` }],
      courses: [mockCourse],
      lessons: [],
      notes: [],
      questions: [],
    });
    render(<SearchPage />, { wrapper: MemoryRouter });
    fireEvent.change(screen.getByRole('combobox', { name: 'Search content' }), {
      target: { value: 'resume' },
    });
    const result = screen.getByRole('option', { name: /Palatine hill fortifications/ });
    expect(result.querySelector('mark')).toHaveTextContent('Résumé');
    expect(result).toHaveTextContent('conclusion.');
  });

  it('names the search field and avoids repeating its heading and typing instructions', () => {
    render(<SearchPage />, { wrapper: MemoryRouter });
    expect(screen.getByRole('combobox', { name: 'Search content' })).toHaveFocus();
    expect(screen.queryByRole('heading', { name: 'Search everything' })).not.toBeInTheDocument();
  });

  it('returns focus to the search field after clearing the filters', () => {
    render(<SearchPage />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('button', { name: 'Due now' }));
    const clear = screen.getByRole('button', { name: 'Clear' });
    clear.focus();
    fireEvent.click(clear);
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Due now' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('identifies the full page as content search without advertising the quick-search shortcut', () => {
    render(<SearchPage />, { wrapper: MemoryRouter });

    expect(screen.getByRole('heading', { name: 'Search content' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Search content' }).closest('header'),
    ).not.toHaveClass('bg-surface');
    expect(screen.queryByText('Library')).not.toBeInTheDocument();
    expect(screen.queryByText('Ctrl/Cmd+K')).not.toBeInTheDocument();
  });

  it('badges a sequence-generated card result', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [{ ...mockCard, sequenceItemId: 'item-1' }],
      courses: [mockCourse],
      lessons: [],
      notes: [],
      questions: [],
    });
    render(<SearchPage />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByRole('combobox', { name: 'Search content' }), {
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
      questions: [],
    });
    render(<SearchPage />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByRole('combobox', { name: 'Search content' }), {
      target: { value: 'Course Context' },
    });

    expect(screen.getAllByText('Course Context')).toHaveLength(2);
  });

  it('badges an occlusion-generated card result', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [{ ...mockCard, occlusionRegionId: 'region-1' }],
      courses: [mockCourse],
      lessons: [],
      notes: [],
      questions: [],
    });
    render(<SearchPage />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByRole('combobox', { name: 'Search content' }), {
      target: { value: 'Palatine' },
    });

    expect(screen.getByText('Occlusion')).toBeInTheDocument();
  });

  it('renders a Question as a distinct result and opens its Question editor', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [],
      courses: [mockCourse],
      lessons: [],
      notes: [],
      questions: [mockQuestion],
    });
    const router = createMemoryRouter([{ path: '*', element: <SearchPage /> }], {
      initialEntries: ['/search'],
    });
    render(<RouterProvider router={router} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Search content' }), {
      target: { value: 'final velocity' },
    });

    expect(screen.getByText('Question')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /calculate the final velocity/i }));
    expect(router.state.location.pathname).toBe('/course/course-1/questions/question-1/edit');
  });

  it('does not treat a Card filter as a Question filter', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [],
      courses: [mockCourse],
      lessons: [],
      notes: [],
      questions: [mockQuestion],
    });
    render(<SearchPage />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: 'Due now' }));

    expect(screen.queryByText('Calculate the final velocity.')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Search content' }), {
      target: { value: 'final velocity' },
    });
    expect(screen.getByRole('option', { name: /Calculate the final velocity/ })).toHaveTextContent(
      'Calculate the final velocity.',
    );
  });
});
