import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SearchPage } from './SearchPage';
import type { Card, Course, Deck, Lesson, Note } from '../db/types';

const mockDeck: Deck = {
  id: 'deck-1',
  name: 'Test Deck',
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
};

const dataHooks = vi.hoisted(() => ({
  useSearchData: vi.fn(() => ({
    cards: [] as Card[],
    decks: [] as Deck[],
    courses: [] as Course[],
    lessons: [] as Lesson[],
    notes: [] as Note[],
  })),
}));

vi.mock('../state/useSearchData', () => ({
  useSearchData: dataHooks.useSearchData,
}));

describe('SearchPage', () => {
  it('badges a sequence-generated card result', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [{ ...mockCard, sequenceItemId: 'item-1' }],
      decks: [mockDeck],
      courses: [],
      lessons: [],
      notes: [],
    });
    render(<SearchPage />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'Palatine' },
    });

    expect(screen.getByText('Sequence')).toBeInTheDocument();
  });

  it('uses the Course name for a course card without a backing Deck row', () => {
    dataHooks.useSearchData.mockReturnValue({
      cards: [{ ...mockCard, deckId: 'missing-deck', courseId: mockCourse.id }],
      decks: [],
      courses: [mockCourse],
      lessons: [],
      notes: [],
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
      decks: [mockDeck],
      courses: [],
      lessons: [],
      notes: [],
    });
    render(<SearchPage />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'Palatine' },
    });

    expect(screen.getByText('Occlusion')).toBeInTheDocument();
  });
});
