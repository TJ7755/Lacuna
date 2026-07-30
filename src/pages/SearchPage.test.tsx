import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SearchPage } from './SearchPage';
import type { Card, Deck } from '../db/types';

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
  useDecks: vi.fn((): Deck[] => []),
  useAllCards: vi.fn((): Card[] => []),
  useCourses: vi.fn(() => []),
  useAllLessons: vi.fn(() => []),
  useAllNotes: vi.fn(() => []),
}));

vi.mock('../state/useData', () => ({
  useDecks: dataHooks.useDecks,
  useAllCards: dataHooks.useAllCards,
}));
vi.mock('../state/useCourseData', () => ({
  useCourses: dataHooks.useCourses,
  useAllLessons: dataHooks.useAllLessons,
  useAllNotes: dataHooks.useAllNotes,
}));

describe('SearchPage', () => {
  it('badges a sequence-generated card result', () => {
    dataHooks.useDecks.mockReturnValue([mockDeck]);
    dataHooks.useAllCards.mockReturnValue([{ ...mockCard, sequenceItemId: 'item-1' }]);
    render(<SearchPage />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'Palatine' },
    });

    expect(screen.getByText('Sequence')).toBeInTheDocument();
  });

  it('badges an occlusion-generated card result', () => {
    dataHooks.useDecks.mockReturnValue([mockDeck]);
    dataHooks.useAllCards.mockReturnValue([{ ...mockCard, occlusionRegionId: 'region-1' }]);
    render(<SearchPage />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'Palatine' },
    });

    expect(screen.getByText('Occlusion')).toBeInTheDocument();
  });
});
