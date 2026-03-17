/**
 * Review store — Zustand
 *
 * Orchestrates a review session: loads due cards, bridges the pure session
 * manager (`src/lib/reviewSession.ts`) with the database, and exposes UI
 * state for the review page and its components.
 */

import { create } from 'zustand';
import { getCardsByDeckRecursive, getDueCount } from '../db/repositories/cards';
import { getLinkedNotes } from '../db/repositories/cardNoteLinks';
import { getCardState, updateCardState } from '../db/repositories/fsrs';
import { tiptapToPlainText } from '../lib/tiptapUtils';
import { buildExamModeSession, type ExamModeSession } from '../lib/exam-mode';
import { expandCards } from '../lib/cardExpansion';
import {
  applyRating,
  getDueCards,
  type CardWithState,
  type ReviewRating,
} from '../lib/fsrs';
import {
  advanceSession,
  createSession,
  type ReviewSession,
} from '../lib/reviewSession';
import { useDeckStore } from './decks';

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

interface ReviewState {
  session: ReviewSession | null;
  examMode: boolean;
  examModeSession: ExamModeSession | null;
  /** Cache of computed ExamModeSession per deck id — for the home page summary. */
  examModeSessions: Record<string, ExamModeSession>;
  flipped: boolean;
  loading: boolean;
  error: string | null;
  /** Due card counts per deck id — populated by loadDueCounts. */
  deckDueCounts: Record<string, number>;

  /** Loads due cards for a deck and creates a new session. */
  startSession: (deckId: string) => Promise<void>;
  startExamSession: (deckId: string) => Promise<void>;
  /** Computes and caches an ExamModeSession without starting a review session. */
  cacheExamModeSession: (deckId: string, examDate: Date) => Promise<void>;
  /** Flips the current card from front to back. */
  flipCard: () => void;
  /**
   * Submits a rating for the current card:
   * 1. Applies FSRS scheduling via applyRating
   * 2. Persists the updated state + appends to rating_history
   * 3. Advances the session
   * 4. Resets flipped to false
   */
  submitRating: (rating: ReviewRating) => Promise<void>;
  /** Clears session state — call on unmount or navigation away. */
  clearSession: () => void;
  /** Loads due card counts for a set of deck ids (for the deck selection view). */
  loadDueCounts: (deckIds: string[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetches cards with their FSRS states for a deck and all its descendants.
 * Falls back to per-card getCardState for recursive decks.
 */
async function fetchCardsWithStates(deckId: string): Promise<CardWithState[]> {
  // Try the efficient joined query for direct cards first, then fall back to
  // recursive traversal for descendant decks.
  const deckCards = await getCardsByDeckRecursive(deckId);

  const pairs = await Promise.all(
    deckCards.map(async (card) => {
      const state = await getCardState(card.id);
      if (!state) {
        return null;
      }

      const linkedNotes = await getLinkedNotes(card.id);
      const noteContext = linkedNotes
        .map((note) => tiptapToPlainText(note.content))
        .map((text) => text.trim())
        .filter(Boolean)
        .join('\n\n');

      const cardWithState: CardWithState = noteContext
        ? { card, state, noteContext }
        : { card, state };

      return cardWithState;
    }),
  );
  return pairs.filter((cs): cs is CardWithState => cs !== null);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useReviewStore = create<ReviewState>((set, get) => ({
  session: null,
  examMode: false,
  examModeSession: null,
  examModeSessions: {},
  flipped: false,
  loading: false,
  error: null,
  deckDueCounts: {},

  startSession: async (deckId) => {
    set({
      loading: true,
      error: null,
      session: null,
      flipped: false,
      examMode: false,
      examModeSession: null,
    });
    try {
      const raw = await fetchCardsWithStates(deckId);
      const expanded = expandCards(raw);
      const due = getDueCards(expanded);
      const session = createSession(deckId, due);
      set({ session, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
    }
  },

  startExamSession: async (deckId) => {
    set({ loading: true, error: null, session: null, flipped: false });
    try {
      const deck = useDeckStore
        .getState()
        .decks.find((item) => item.id === deckId);
      const examDate = deck?.exam_date ?? null;
      if (!examDate) {
        throw new Error(
          '[lacuna/review] Cannot start exam session without an exam date.',
        );
      }

      const examModeSession = await buildExamModeSession(deckId, examDate);
      const queuedCards = examModeSession.todayQueue.map(
        (entry) => entry.cardWithState,
      );

      const session = createSession(deckId, queuedCards);

      set((state) => ({
        session,
        loading: false,
        examMode: true,
        examModeSession,
        examModeSessions: {
          ...state.examModeSessions,
          [deckId]: examModeSession,
        },
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
      throw err;
    }
  },

  cacheExamModeSession: async (deckId, examDate) => {
    try {
      const examModeSession = await buildExamModeSession(deckId, examDate);
      set((state) => ({
        examModeSessions: {
          ...state.examModeSessions,
          [deckId]: examModeSession,
        },
      }));
    } catch {
      // Silent failure — caching is best-effort; the home page will simply skip the summary.
    }
  },

  flipCard: () => {
    set({ flipped: true });
  },

  submitRating: async (rating) => {
    const { session } = get();
    if (!session) return;

    const queue = session.queue[session.currentIndex];
    if (!queue) return;

    const newState = applyRating(queue.state, rating);
    const now = new Date();

    const newHistory = [
      ...queue.state.rating_history,
      `${now.toISOString()}:${rating}`,
    ];

    try {
      await updateCardState(queue.card.id, {
        stability: newState.stability,
        difficulty: newState.difficulty,
        due: newState.due,
        last_review: newState.last_review,
        rating_history: newHistory,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      // Advance anyway so the session can continue.
    }

    const updated = advanceSession(session, rating);
    set({ session: updated, flipped: false });
  },

  clearSession: () => {
    set({
      session: null,
      flipped: false,
      error: null,
      examMode: false,
      examModeSession: null,
    });
  },

  loadDueCounts: async (deckIds) => {
    const entries = await Promise.all(
      deckIds.map(async (id) => {
        try {
          const due = await getDueCount(id);
          return [id, due] as const;
        } catch {
          return [id, 0] as const;
        }
      }),
    );
    set({ deckDueCounts: Object.fromEntries(entries) });
  },
}));
