import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SearchPage } from './SearchPage';
import type { Card, Course, LegacyDeckRecord, Lesson, Note } from '../db/types';
import type { FixedQuestionDefinition, QuestionDefinition } from '../questions/types';

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

vi.mock('../state/useSearchData', () => ({
  useSearchData: dataHooks.useSearchData,
}));

describe('SearchPage', () => {
  it('identifies the full page as content search without advertising the quick-search shortcut', () => {
    render(<SearchPage />, { wrapper: MemoryRouter });

    expect(screen.getByRole('heading', { name: 'Search content' })).toBeInTheDocument();
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
      questions: [],
    });
    render(<SearchPage />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
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

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
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

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'final velocity' },
    });

    expect(screen.getByText('Question')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /calculate the final velocity/i }));
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

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'final velocity' },
    });
    expect(screen.getByText('Calculate the final velocity.')).toBeInTheDocument();
  });
});
