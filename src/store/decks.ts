/**
 * Deck store — Zustand
 *
 * Holds the full flat list of non-deleted decks and exposes async actions that
 * call through to the repository layer. Each mutating action calls `fetchDecks`
 * after completion to keep the store in sync with the database.
 *
 * `cardCounts` is a map of deck id → card count, populated alongside decks.
 */

import { create } from 'zustand';
import type { Deck } from '../db/repositories/decks';
import {
  getAllDecks,
  createDeck as repoCreateDeck,
  updateDeck as repoUpdateDeck,
  deleteDeck as repoDeleteDeck,
} from '../db/repositories/decks';
import { getCardCountByDeck } from '../db/repositories/cards';

interface DeckState {
  decks: Deck[];
  cardCounts: Record<string, number>;
  loading: boolean;
  error: string | null;

  fetchDecks: () => Promise<void>;
  createDeck: (name: string, parentId?: string) => Promise<void>;
  updateDeck: (
    id: string,
    params: { name?: string; examDate?: Date | null },
  ) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
}

export const useDeckStore = create<DeckState>((set, get) => ({
  decks: [],
  cardCounts: {},
  loading: false,
  error: null,

  fetchDecks: async () => {
    set({ loading: true, error: null });
    try {
      const decks = await getAllDecks();
      const countEntries = await Promise.all(
        decks.map(async (d) => [d.id, await getCardCountByDeck(d.id)] as const),
      );
      const cardCounts = Object.fromEntries(countEntries);
      set({ decks, cardCounts, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
    }
  },

  createDeck: async (name, parentId) => {
    set({ error: null });
    try {
      await repoCreateDeck({ name, parentId });
      await get().fetchDecks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  updateDeck: async (id, params) => {
    set({ error: null });
    try {
      await repoUpdateDeck(id, params);
      await get().fetchDecks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  deleteDeck: async (id) => {
    set({ error: null });
    try {
      await repoDeleteDeck(id);
      await get().fetchDecks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },
}));
