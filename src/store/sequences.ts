import { create } from 'zustand';
import type { SequenceCard, SequenceItem } from '../types';
import type { FsrsState } from '../db/repositories/fsrs';
import {
  SequenceLockedError,
  createSequenceCard as repoCreateSequenceCard,
  deleteSequenceCard as repoDeleteSequenceCard,
  getSequenceCardsByDeck,
  getSequenceCardsWithState,
  getSequenceDueCount,
  updateSequenceCard as repoUpdateSequenceCard,
} from '../db/repositories/sequenceCards';

type SequenceWithItems = SequenceCard & { items: SequenceItem[] };

interface SequenceState {
  sequences: SequenceWithItems[];
  sequencesWithState: Array<{
    card: SequenceCard;
    items: SequenceItem[];
    itemStates: FsrsState[];
    sequenceState: FsrsState;
  }>;
  dueCount: number;
  currentDeckId: string | null;
  loading: boolean;
  error: string | null;

  fetchSequencesByDeck: (deckId: string) => Promise<void>;
  createSequenceCard: (params: {
    deckId: string;
    title: string;
    items: string[];
  }) => Promise<SequenceWithItems>;
  updateSequenceCard: (
    id: string,
    params: { title?: string; items?: string[] },
  ) => Promise<void>;
  deleteSequenceCard: (id: string) => Promise<void>;
}

export { SequenceLockedError };

export const useSequenceStore = create<SequenceState>((set, get) => ({
  sequences: [],
  sequencesWithState: [],
  dueCount: 0,
  currentDeckId: null,
  loading: false,
  error: null,

  fetchSequencesByDeck: async (deckId) => {
    set({ loading: true, error: null, currentDeckId: deckId });
    try {
      const [sequences, sequencesWithState, dueCount] = await Promise.all([
        getSequenceCardsByDeck(deckId),
        getSequenceCardsWithState(deckId),
        getSequenceDueCount(deckId),
      ]);
      set({ sequences, sequencesWithState, dueCount, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  createSequenceCard: async (params) => {
    set({ error: null });
    try {
      const sequence = await repoCreateSequenceCard(params);
      const { currentDeckId } = get();
      if (currentDeckId) {
        await get().fetchSequencesByDeck(currentDeckId);
      }
      return sequence;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  updateSequenceCard: async (id, params) => {
    set({ error: null });
    try {
      await repoUpdateSequenceCard(id, params);
      const { currentDeckId } = get();
      if (currentDeckId) {
        await get().fetchSequencesByDeck(currentDeckId);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      if (err instanceof SequenceLockedError) {
        throw err;
      }
      throw err;
    }
  },

  deleteSequenceCard: async (id) => {
    set({ error: null });
    try {
      await repoDeleteSequenceCard(id);
      const { currentDeckId } = get();
      if (currentDeckId) {
        await get().fetchSequencesByDeck(currentDeckId);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },
}));
