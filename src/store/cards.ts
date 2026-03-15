/**
 * Card store — Zustand
 *
 * Holds cards (and their FSRS states) for the currently viewed deck. Each
 * mutating action calls `fetchCardsByDeck` after completion to keep state in
 * sync with the database.
 */

import { create } from 'zustand';
import type { Card } from '../db/repositories/cards';
import type { FsrsState } from '../db/repositories/fsrs';
import {
  getCardsWithState,
  getDueCount,
  createCard as repoCreateCard,
  updateCard as repoUpdateCard,
  deleteCard as repoDeleteCard,
  createImageOcclusionCard as repoCreateImageOcclusionCard,
  updateImageOcclusionCard as repoUpdateImageOcclusionCard,
} from '../db/repositories/cards';
import type { OcclusionData } from '../types';

export type CardWithStateRow = { card: Card; state: FsrsState };

interface CardState {
  /** Flat list of cards for the current deck (derived from cardsWithState). */
  cards: Card[];
  /** Cards paired with their FSRS state — richer than `cards` alone. */
  cardsWithState: CardWithStateRow[];
  /** Count of cards due for review in the current deck. */
  dueCount: number;
  currentDeckId: string | null;
  loading: boolean;
  error: string | null;

  fetchCardsByDeck: (deckId: string) => Promise<void>;
  createCard: (params: {
    deckId: string;
    cardType: 'basic' | 'cloze';
    front?: string;
    back?: string;
    clozeText?: string;
  }) => Promise<Card>;
  updateCard: (
    id: string,
    params: { front?: string; back?: string; clozeText?: string },
  ) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  createImageOcclusionCard: (params: {
    deckId: string;
    imageUrl: string;
    occlusionData: OcclusionData;
  }) => Promise<Card>;
  updateImageOcclusionCard: (
    id: string,
    params: { imageUrl?: string; occlusionData?: OcclusionData },
  ) => Promise<void>;
}

export const useCardStore = create<CardState>((set, get) => ({
  cards: [],
  cardsWithState: [],
  dueCount: 0,
  currentDeckId: null,
  loading: false,
  error: null,

  fetchCardsByDeck: async (deckId) => {
    set({ loading: true, error: null, currentDeckId: deckId });
    try {
      const [cardsWithState, dueCount] = await Promise.all([
        getCardsWithState(deckId),
        getDueCount(deckId),
      ]);
      const cards = cardsWithState.map((cs) => cs.card);
      set({ cards, cardsWithState, dueCount, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
    }
  },

  createCard: async (params) => {
    set({ error: null });
    try {
      const card = await repoCreateCard(params);
      const { currentDeckId } = get();
      if (currentDeckId) {
        await get().fetchCardsByDeck(currentDeckId);
      }
      return card;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  updateCard: async (id, params) => {
    set({ error: null });
    try {
      await repoUpdateCard(id, params);
      const { currentDeckId } = get();
      if (currentDeckId) {
        await get().fetchCardsByDeck(currentDeckId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  deleteCard: async (id) => {
    set({ error: null });
    try {
      await repoDeleteCard(id);
      const { currentDeckId } = get();
      if (currentDeckId) {
        await get().fetchCardsByDeck(currentDeckId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  createImageOcclusionCard: async (params) => {
    set({ error: null });
    try {
      const card = await repoCreateImageOcclusionCard(params);
      const { currentDeckId } = get();
      if (currentDeckId) {
        await get().fetchCardsByDeck(currentDeckId);
      }
      return card;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  updateImageOcclusionCard: async (id, params) => {
    set({ error: null });
    try {
      await repoUpdateImageOcclusionCard(id, params);
      const { currentDeckId } = get();
      if (currentDeckId) {
        await get().fetchCardsByDeck(currentDeckId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },
}));
