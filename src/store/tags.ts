/**
 * Tags store — Zustand
 *
 * Holds the global tag list and usage counts. Per-card tag lists are managed
 * locally in components that need them (e.g. TagInput).
 */

import { create } from 'zustand';
import type { Tag } from '../db/repositories/tags';
import {
  getAllTags,
  getTagUsageCounts,
  addTagToCard as repoAddTagToCard,
  removeTagFromCard as repoRemoveTagFromCard,
  deleteTag as repoDeleteTag,
} from '../db/repositories/tags';

interface TagState {
  tags: Tag[];
  tagUsageCounts: Record<string, number>;
  loading: boolean;
  error: string | null;

  fetchAllTags: () => Promise<void>;
  addTagToCard: (cardId: string, tagName: string) => Promise<void>;
  removeTagFromCard: (cardId: string, tagId: string) => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
}

export const useTagStore = create<TagState>((set) => ({
  tags: [],
  tagUsageCounts: {},
  loading: false,
  error: null,

  fetchAllTags: async () => {
    set({ loading: true, error: null });
    try {
      const [tags, tagUsageCounts] = await Promise.all([
        getAllTags(),
        getTagUsageCounts(),
      ]);
      set({ tags, tagUsageCounts, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
    }
  },

  addTagToCard: async (cardId, tagName) => {
    try {
      await repoAddTagToCard(cardId, tagName);
      const [tags, tagUsageCounts] = await Promise.all([
        getAllTags(),
        getTagUsageCounts(),
      ]);
      set({ tags, tagUsageCounts });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  removeTagFromCard: async (cardId, tagId) => {
    try {
      await repoRemoveTagFromCard(cardId, tagId);
      const tagUsageCounts = await getTagUsageCounts();
      set({ tagUsageCounts });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  deleteTag: async (tagId) => {
    try {
      await repoDeleteTag(tagId);
      const [tags, tagUsageCounts] = await Promise.all([
        getAllTags(),
        getTagUsageCounts(),
      ]);
      set({ tags, tagUsageCounts });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },
}));
