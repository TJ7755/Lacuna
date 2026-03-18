/**
 * Review store — Zustand
 */

import { create } from 'zustand';
import { getAllDecks } from '../db/repositories/decks';
import { getCardsByDeckRecursive, getDueCount } from '../db/repositories/cards';
import { getLinkedNotes } from '../db/repositories/cardNoteLinks';
import { getCardState, updateCardState } from '../db/repositories/fsrs';
import {
  getSequenceCardById,
  getSequenceCardsWithState,
  getSequenceDueCount,
} from '../db/repositories/sequenceCards';
import { tiptapToPlainText } from '../lib/tiptapUtils';
import { buildExamModeSession, type ExamModeSession } from '../lib/exam-mode';
import { expandCards, type ReviewQueueItem } from '../lib/cardExpansion';
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
import type { SequenceItem } from '../types';
import { UI } from '../ui-strings';

interface ReviewState {
  session: ReviewSession | null;
  examMode: boolean;
  examModeSession: ExamModeSession | null;
  examModeSessions: Record<string, ExamModeSession>;
  flipped: boolean;
  loading: boolean;
  error: string | null;
  deckDueCounts: Record<string, number>;
  positionDrillEnabled: boolean;

  linesMode: boolean;
  linesModeSequenceId: string | null;
  linesModeItems: SequenceItem[];
  linesModePosition: number;
  linesModeAutoAdvance: boolean;
  linesModeDelaySeconds: number;

  startSession: (
    deckId: string,
    options?: { positionDrill?: boolean },
  ) => Promise<void>;
  startExamSession: (deckId: string) => Promise<void>;
  cacheExamModeSession: (deckId: string, examDate: Date) => Promise<void>;
  flipCard: () => void;
  submitRating: (rating: ReviewRating) => Promise<void>;
  clearSession: () => void;
  loadDueCounts: (deckIds: string[]) => Promise<void>;
  setPositionDrillEnabled: (enabled: boolean) => void;
  startLinesMode: (
    sequenceCardId: string,
    options: { autoAdvance: boolean; delaySeconds: number },
  ) => Promise<void>;
  advanceLinesMode: () => void;
  clearLinesMode: () => void;
}

async function fetchCardsWithStates(deckId: string): Promise<CardWithState[]> {
  const deckCards = await getCardsByDeckRecursive(deckId);
  const pairs = await Promise.all(
    deckCards.map(async (card) => {
      const state = await getCardState(card.id);
      if (!state) return null;

      const linkedNotes = await getLinkedNotes(card.id);
      const noteContext = linkedNotes
        .map((note) => tiptapToPlainText(note.content))
        .map((text) => text.trim())
        .filter(Boolean)
        .join('\n\n');

      return noteContext ? { card, state, noteContext } : { card, state };
    }),
  );
  return pairs.filter((cs): cs is CardWithState => cs !== null);
}

async function getDescendantDeckIds(deckId: string): Promise<string[]> {
  const allDecks = await getAllDecks();
  const target = allDecks.find((deck) => deck.id === deckId);
  if (!target) return [];
  return allDecks
    .filter(
      (deck) =>
        deck.path === target.path || deck.path.startsWith(`${target.path}::`),
    )
    .map((deck) => deck.id);
}

async function fetchSequencesWithStatesRecursive(deckId: string) {
  const deckIds = await getDescendantDeckIds(deckId);
  const all = await Promise.all(
    deckIds.map((id) => getSequenceCardsWithState(id)),
  );
  return all.flat();
}

function applyPositionDrillPrompts(
  items: ReviewQueueItem[],
): ReviewQueueItem[] {
  const sequenceItems = items.filter(
    (item): item is Extract<ReviewQueueItem, { queueType: 'sequence_chain' }> =>
      item.queueType === 'sequence_chain',
  );
  const modes = sequenceItems.map((_, index) => index % 2 === 0);
  for (let i = modes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [modes[i], modes[j]] = [modes[j], modes[i]];
  }

  let modeIndex = 0;
  return items.map((item) => {
    if (item.queueType !== 'sequence_chain') return item;
    const useWhatPrompt = modes[modeIndex] ?? false;
    modeIndex += 1;
    if (useWhatPrompt) {
      return {
        ...item,
        prompt: UI.sequence.positionPromptWhat(item.position),
      };
    }
    return {
      ...item,
      prompt: `${UI.sequence.positionPromptAfter}\n${item.prompt}`,
    };
  });
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  session: null,
  examMode: false,
  examModeSession: null,
  examModeSessions: {},
  flipped: false,
  loading: false,
  error: null,
  deckDueCounts: {},
  positionDrillEnabled: false,
  linesMode: false,
  linesModeSequenceId: null,
  linesModeItems: [],
  linesModePosition: 0,
  linesModeAutoAdvance: false,
  linesModeDelaySeconds: 3,

  setPositionDrillEnabled: (enabled) => set({ positionDrillEnabled: enabled }),

  startSession: async (deckId, options) => {
    const positionDrill = options?.positionDrill ?? get().positionDrillEnabled;
    set({
      loading: true,
      error: null,
      session: null,
      flipped: false,
      examMode: false,
      examModeSession: null,
      positionDrillEnabled: positionDrill,
    });
    try {
      const [rawCards, sequenceData] = await Promise.all([
        fetchCardsWithStates(deckId),
        fetchSequencesWithStatesRecursive(deckId),
      ]);
      let expanded = expandCards(
        rawCards,
        sequenceData.map((entry) => ({
          card: entry.card,
          items: entry.items,
          itemStates: entry.itemStates,
        })),
      );
      if (positionDrill) {
        expanded = applyPositionDrillPrompts(expanded);
      }
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
      // Best effort cache only.
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
      await updateCardState(queue.fsrsCardId, {
        stability: newState.stability,
        difficulty: newState.difficulty,
        due: newState.due,
        last_review: newState.last_review,
        rating_history: newHistory,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
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
          const [dueCards, dueSequences] = await Promise.all([
            getDueCount(id),
            getSequenceDueCount(id),
          ]);
          return [id, dueCards + dueSequences] as const;
        } catch {
          return [id, 0] as const;
        }
      }),
    );
    set({ deckDueCounts: Object.fromEntries(entries) });
  },

  startLinesMode: async (sequenceCardId, options) => {
    const sequence = await getSequenceCardById(sequenceCardId);
    if (!sequence) {
      throw new Error('[lacuna/review] Sequence not found.');
    }
    set({
      linesMode: true,
      linesModeSequenceId: sequenceCardId,
      linesModeItems: sequence.items,
      linesModePosition: 0,
      linesModeAutoAdvance: options.autoAdvance,
      linesModeDelaySeconds: options.delaySeconds,
    });
  },

  advanceLinesMode: () => {
    const { linesModeItems, linesModePosition } = get();
    const next = linesModePosition + 1;
    if (next >= linesModeItems.length) {
      set({
        linesMode: false,
        linesModePosition: linesModeItems.length,
      });
      return;
    }
    set({ linesModePosition: next });
  },

  clearLinesMode: () => {
    set({
      linesMode: false,
      linesModeSequenceId: null,
      linesModeItems: [],
      linesModePosition: 0,
      linesModeAutoAdvance: false,
      linesModeDelaySeconds: 3,
    });
  },
}));
