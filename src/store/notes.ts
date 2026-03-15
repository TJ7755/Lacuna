import { create } from 'zustand';
import {
  createNote as repoCreateNote,
  deleteNote as repoDeleteNote,
  getAllNotes,
  getNoteById,
  getNotesByDeck,
  updateNote as repoUpdateNote,
  type Note,
} from '../db/repositories/notes';

interface NoteState {
  notes: Note[];
  currentNote: Note | null;
  loading: boolean;
  error: string | null;

  fetchAllNotes: () => Promise<void>;
  fetchNotesByDeck: (deckId: string) => Promise<void>;
  loadNote: (id: string) => Promise<void>;
  createNote: (params: { title: string; deckId?: string }) => Promise<Note>;
  updateNote: (
    id: string,
    params: { title?: string; deckId?: string | null; content?: object },
  ) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  clearCurrentNote: () => void;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  currentNote: null,
  loading: false,
  error: null,

  fetchAllNotes: async () => {
    set({ loading: true, error: null });

    try {
      const notes = await getAllNotes();
      const currentId = get().currentNote?.id;
      const currentNote = currentId
        ? (notes.find((note) => note.id === currentId) ?? null)
        : null;

      set({
        notes,
        currentNote,
        loading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
    }
  },

  fetchNotesByDeck: async (deckId) => {
    set({ loading: true, error: null });

    try {
      const notes = await getNotesByDeck(deckId);
      const currentId = get().currentNote?.id;
      const currentNote = currentId
        ? (notes.find((note) => note.id === currentId) ?? null)
        : null;

      set({ notes, currentNote, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
    }
  },

  loadNote: async (id) => {
    set({ loading: true, error: null });

    try {
      const note = await getNoteById(id);
      set({
        currentNote: note,
        loading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
    }
  },

  createNote: async (params) => {
    set({ error: null });

    try {
      const note = await repoCreateNote({
        title: params.title,
        deckId: params.deckId,
      });

      set((state) => ({
        notes: [note, ...state.notes],
      }));

      return note;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  updateNote: async (id, params) => {
    set({ error: null });

    try {
      const updated = await repoUpdateNote(id, params);

      set((state) => ({
        notes: state.notes.map((note) => (note.id === id ? updated : note)),
        currentNote: state.currentNote?.id === id ? updated : state.currentNote,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  deleteNote: async (id) => {
    set({ error: null });

    try {
      await repoDeleteNote(id);

      set((state) => ({
        notes: state.notes.filter((note) => note.id !== id),
        currentNote: state.currentNote?.id === id ? null : state.currentNote,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  clearCurrentNote: () => {
    set({ currentNote: null });
  },
}));
