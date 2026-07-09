import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { DeckSettings } from './DeckSettings';
import type { Card, Deck } from '../db/types';

const mockNavigate = vi.fn();
const mockUpdateDeck = vi.fn().mockResolvedValue(undefined);
const mockNotify = vi.fn();

let mockDeck: Deck | null | undefined;
let mockCards: Card[] | undefined;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../state/useData', () => ({
  useDeck: () => mockDeck,
  useCards: () => mockCards,
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

vi.mock('../db/repository', () => ({
  updateDeck: (id: string, changes: Record<string, unknown>) => mockUpdateDeck(id, changes),
  deleteDecks: vi.fn().mockResolvedValue(undefined),
  restoreDecks: vi.fn().mockResolvedValue(undefined),
  snapshotDecks: vi.fn().mockResolvedValue([]),
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}));

vi.mock('../state/useOptimiser', () => ({
  useOptimiser: () => ({
    status: 'idle',
    progress: 0,
    result: null,
    error: null,
    run: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('../state/optimiseSetting', () => ({
  useAutoOptimiseDefault: () => [true, vi.fn()],
  optimiseEnabledForDeck: () => true,
}));

const deck: Deck = {
  id: 'deck-1',
  name: 'Original name',
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
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/deck/deck-1/settings']}>
      <Routes>
        <Route path="/deck/:deckId/settings" element={<DeckSettings />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockDeck = deck;
  mockCards = [];
  mockUpdateDeck.mockClear();
  mockNotify.mockClear();
  mockNavigate.mockClear();
});

describe('DeckSettings', () => {
  it('shows a skeleton while loading', () => {
    mockDeck = undefined;
    renderPage();
    expect(screen.queryByDisplayValue('Original name')).not.toBeInTheDocument();
  });

  it('shows a not-found state when the deck is missing', () => {
    mockDeck = null;
    renderPage();
    expect(screen.getByText('This deck could not be found.')).toBeInTheDocument();
  });

  it('populates fields from the deck', () => {
    renderPage();
    expect(screen.getByDisplayValue('Original name')).toBeInTheDocument();
  });

  it('saves edits by calling updateDeck', () => {
    renderPage();
    const nameInput = screen.getByDisplayValue('Original name');
    fireEvent.change(nameInput, { target: { value: 'Renamed deck' } });
    fireEvent.click(screen.getByText('Save changes'));
    expect(mockUpdateDeck).toHaveBeenCalledWith(
      'deck-1',
      expect.objectContaining({ name: 'Renamed deck' }),
    );
  });
});
