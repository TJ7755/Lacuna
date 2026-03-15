# Lacuna — Codebase Audit

> Generated: 2026-03-15. Every section below was produced by reading the actual source files. No guessing. No paraphrasing of specs. Deviations from `DESIGN.md` are explicitly flagged.

---

## 1. Directory tree

```
src/
├── components/
│   ├── cards/
│   │   ├── BasicCardBack.tsx
│   │   ├── BasicCardFront.tsx
│   │   ├── CardEditor.module.css
│   │   ├── CardEditor.tsx
│   │   ├── CardFace.module.css
│   │   ├── CardList.module.css
│   │   ├── CardList.tsx
│   │   ├── CardRow.module.css
│   │   ├── CardRow.tsx
│   │   ├── ClozeCardBack.tsx
│   │   ├── ClozeCardFront.tsx
│   │   ├── ClozeHighlighter.module.css
│   │   ├── ClozeHighlighter.tsx
│   │   ├── ImageOcclusionForm.tsx
│   │   ├── MarkdownPreview.module.css
│   │   ├── MarkdownPreview.tsx
│   │   ├── OcclusionCard.module.css
│   │   ├── OcclusionCardBack.tsx
│   │   ├── OcclusionCardFront.tsx
│   │   ├── OcclusionEditor.module.css
│   │   └── OcclusionEditor.tsx
│   ├── decks/
│   │   ├── CreateDeckModal.module.css
│   │   ├── CreateDeckModal.tsx
│   │   ├── DeckRow.module.css
│   │   ├── DeckRow.tsx
│   │   ├── DeckTree.module.css
│   │   ├── DeckTree.tsx
│   │   ├── DeleteDeckModal.module.css
│   │   ├── DeleteDeckModal.tsx
│   │   └── RenameDeckModal.tsx
│   ├── layout/
│   │   ├── AppShell.module.css
│   │   ├── AppShell.tsx
│   │   └── ErrorBoundary.tsx
│   ├── llm/
│   │   ├── GenerateCardsModal.module.css
│   │   ├── GenerateCardsModal.tsx
│   │   ├── PracticeTestModal.module.css
│   │   └── PracticeTestModal.tsx
│   ├── notes/
│   │   ├── DocumentEmbed.module.css
│   │   ├── DocumentEmbed.tsx
│   │   ├── DocumentEmbedNode.ts
│   │   ├── EditorToolbar.module.css
│   │   ├── EditorToolbar.tsx
│   │   ├── ImportDocumentButton.tsx
│   │   ├── ImportDocumentModal.module.css
│   │   ├── ImportDocumentModal.tsx
│   │   ├── NoteEditor.module.css
│   │   ├── NoteEditor.tsx
│   │   ├── NoteList.module.css
│   │   └── NoteList.tsx
│   ├── review/
│   │   ├── ExamModeWarning.module.css
│   │   ├── ExamModeWarning.tsx
│   │   ├── RatingButtons.module.css
│   │   ├── RatingButtons.tsx
│   │   ├── ReviewCard.module.css
│   │   ├── ReviewCard.tsx
│   │   ├── SessionComplete.module.css
│   │   ├── SessionComplete.tsx
│   │   ├── SessionProgress.module.css
│   │   └── SessionProgress.tsx
│   └── tags/
│       ├── TagChip.module.css
│       ├── TagChip.tsx
│       ├── TagInput.module.css
│       └── TagInput.tsx
├── db/
│   ├── client.ts
│   ├── dbContext.ts
│   ├── DbProvider.tsx
│   ├── migrations/
│   │   ├── 0000_friendly_energizer.sql
│   │   ├── 0001_hesitant_reaper.sql
│   │   ├── index.ts
│   │   └── meta/
│   │       ├── _journal.json
│   │       ├── 0000_snapshot.json
│   │       └── 0001_snapshot.json
│   ├── repositories/
│   │   ├── cardNoteLinks.ts
│   │   ├── cards.ts
│   │   ├── decks.ts
│   │   ├── fsrs.ts
│   │   ├── notes.ts
│   │   ├── settings.ts
│   │   └── tags.ts
│   └── schema.ts
├── hooks/
│   └── useDb.ts
├── lib/
│   ├── cardExpansion.test.ts
│   ├── cardExpansion.ts
│   ├── cloze.test.ts
│   ├── cloze.ts
│   ├── documents/
│   │   ├── exportDocx.ts
│   │   ├── exportPdf.ts
│   │   ├── importDocx.ts
│   │   └── importPdf.ts
│   ├── editor.ts
│   ├── exam-mode.test.ts
│   ├── exam-mode.ts
│   ├── formatDuration.ts
│   ├── fsrs.ts
│   ├── llm/
│   │   ├── client.ts
│   │   ├── prompts.ts
│   │   └── service.ts
│   ├── pdfjs.ts
│   ├── reviewSession.ts
│   ├── settingsKeys.ts
│   ├── tags.test.ts
│   ├── tags.ts
│   ├── tiptapUtils.test.ts
│   └── tiptapUtils.ts
├── main.tsx
├── pages/
│   ├── DeckDetail.module.css
│   ├── DeckDetail.tsx
│   ├── Decks.module.css
│   ├── Decks.tsx
│   ├── Home.module.css
│   ├── Home.tsx
│   ├── Notes.module.css
│   ├── Notes.tsx
│   ├── NotFound.tsx
│   ├── Review.module.css
│   ├── Review.tsx
│   ├── Settings.module.css
│   └── Settings.tsx
├── router/
│   └── index.tsx
├── store/
│   ├── cards.ts
│   ├── decks.ts
│   ├── notes.ts
│   ├── review.ts
│   ├── settings.ts
│   └── tags.ts
├── styles/
│   ├── global.css
│   └── tokens.css
├── types/
│   └── index.ts
└── ui-strings.ts
```

---

## 2. Dependencies

### `dependencies`

| Package                                 | Version        | Used?           | Notes                                                                                |
| --------------------------------------- | -------------- | --------------- | ------------------------------------------------------------------------------------ |
| `@sqlite.org/sqlite-wasm`               | ^3.51.2-build7 | ✅              | `src/db/client.ts`                                                                   |
| `@tiptap/extension-code-block-lowlight` | ^3.20.1        | ✅              | `src/lib/editor.ts`                                                                  |
| `@tiptap/pm`                            | ^3.20.1        | ✅              | Required by TipTap internals                                                         |
| `@tiptap/react`                         | ^3.20.1        | ✅              | Notes components                                                                     |
| `@tiptap/starter-kit`                   | ^3.20.1        | ✅              | `src/lib/editor.ts`                                                                  |
| `docx`                                  | ^9.6.1         | ✅              | `src/lib/documents/exportDocx.ts`                                                    |
| `dompurify`                             | ^3.3.3         | ✅              | `src/components/cards/MarkdownPreview.tsx`                                           |
| `drizzle-orm`                           | ^0.45.1        | ✅              | All repository files                                                                 |
| `framer-motion`                         | ^12.36.0       | ✅              | Multiple components for animations                                                   |
| `jspdf`                                 | ^4.2.0         | ✅              | `src/lib/documents/exportPdf.ts`                                                     |
| `jspdf-autotable`                       | ^5.0.7         | ✅              | Imported as side-effect in `exportPdf.ts`                                            |
| `katex`                                 | ^0.16.38       | ✅              | `src/lib/editor.ts`, `src/components/cards/MarkdownPreview.tsx`                      |
| `lowlight`                              | ^3.3.0         | ✅              | `src/lib/editor.ts`                                                                  |
| `mammoth`                               | ^1.12.0        | ✅              | `src/lib/documents/importDocx.ts`, `DocumentEmbed.tsx`                               |
| `marked`                                | ^17.0.4        | ✅              | `src/components/cards/MarkdownPreview.tsx`                                           |
| `pdfjs-dist`                            | ^5.5.207       | ✅              | `src/lib/pdfjs.ts`                                                                   |
| `react`                                 | ^19.2.4        | ✅              | Framework                                                                            |
| `react-dom`                             | ^19.2.4        | ✅              | Framework                                                                            |
| `react-katex`                           | ^3.1.0         | ❌ **UNUSED**   | Installed but never imported anywhere in `src/`                                      |
| `react-router-dom`                      | ^7.13.1        | ✅              | Router                                                                               |
| `ts-fsrs`                               | ^5.2.3         | ✅              | `src/db/repositories/fsrs.ts`, `src/lib/fsrs.ts`                                     |
| `uuid`                                  | ^13.0.0        | ✅              | All repository files                                                                 |
| `vite-plugin-static-copy`               | ^3.3.0         | ✅ (build-time) | **⚠ Should be in `devDependencies`** — it is a Vite plugin, not a runtime dependency |
| `zustand`                               | ^5.0.11        | ✅              | All store files                                                                      |

### `devDependencies`

All `devDependencies` are appropriate and used as expected. No missing entries for runtime imports.

---

## 3. Database schema

Source: `src/db/schema.ts`.

### Timestamps helper

A shared `timestamps` object is spread into every table:

- `created_at` — `INTEGER (timestamp)`, `NOT NULL`, default `new Date()` on insert
- `updated_at` — `INTEGER (timestamp)`, `NOT NULL`, default `new Date()` on insert
- `deleted_at` — `INTEGER (timestamp)`, **nullable** — used for soft deletes

This matches the DESIGN.md requirement for `created_at`, `updated_at`, and `deleted_at` on all records.

### Tables

#### `decks`

| Column       | Type                  | Constraints                                              |
| ------------ | --------------------- | -------------------------------------------------------- |
| `id`         | `text`                | PRIMARY KEY                                              |
| `name`       | `text`                | NOT NULL                                                 |
| `parent_id`  | `text`                | nullable (self-referential FK, not enforced at DB level) |
| `path`       | `text`                | NOT NULL — e.g. `"Languages::French::Vocab"`             |
| `exam_date`  | `integer (timestamp)` | nullable                                                 |
| `created_at` | `integer (timestamp)` | NOT NULL                                                 |
| `updated_at` | `integer (timestamp)` | NOT NULL                                                 |
| `deleted_at` | `integer (timestamp)` | nullable                                                 |

UUID PK: ✅ (generated via `uuidv4()` in application code). Soft delete: ✅. Timestamps: ✅.

Note: `parent_id` is not declared as a formal FK in the Drizzle schema — referential integrity is enforced only in application code.

#### `cards`

| Column           | Type                                                  | Constraints               |
| ---------------- | ----------------------------------------------------- | ------------------------- |
| `id`             | `text`                                                | PRIMARY KEY               |
| `deck_id`        | `text`                                                | NOT NULL, FK → `decks.id` |
| `card_type`      | `text` enum `'basic' \| 'cloze' \| 'image_occlusion'` | NOT NULL                  |
| `front`          | `text`                                                | NOT NULL                  |
| `back`           | `text`                                                | NOT NULL                  |
| `cloze_text`     | `text`                                                | nullable                  |
| `image_url`      | `text`                                                | nullable                  |
| `occlusion_data` | `text (json)`                                         | nullable                  |
| `created_at`     | `integer (timestamp)`                                 | NOT NULL                  |
| `updated_at`     | `integer (timestamp)`                                 | NOT NULL                  |
| `deleted_at`     | `integer (timestamp)`                                 | nullable                  |

UUID PK: ✅. Soft delete: ✅. Timestamps: ✅.

#### `fsrs_state`

| Column           | Type                  | Constraints                       |
| ---------------- | --------------------- | --------------------------------- |
| `id`             | `text`                | PRIMARY KEY                       |
| `card_id`        | `text`                | NOT NULL, UNIQUE, FK → `cards.id` |
| `stability`      | `real`                | NOT NULL                          |
| `difficulty`     | `real`                | NOT NULL                          |
| `due`            | `integer (timestamp)` | NOT NULL                          |
| `last_review`    | `integer (timestamp)` | nullable                          |
| `rating_history` | `text (json)`         | NOT NULL, default `[]`            |
| `created_at`     | `integer (timestamp)` | NOT NULL                          |
| `updated_at`     | `integer (timestamp)` | NOT NULL                          |
| `deleted_at`     | `integer (timestamp)` | nullable                          |

UUID PK: ✅. Soft delete: ✅. Timestamps: ✅.

Note: `rating_history` is declared `text` with `mode: 'json'` and `notNull()`. Drizzle infers the TypeScript type as `unknown`, so the review store casts it at runtime with `Array.isArray(...)`.

#### `notes`

| Column       | Type                  | Constraints              |
| ------------ | --------------------- | ------------------------ |
| `id`         | `text`                | PRIMARY KEY              |
| `deck_id`    | `text`                | nullable FK → `decks.id` |
| `title`      | `text`                | NOT NULL                 |
| `content`    | `text (json)`         | NOT NULL                 |
| `created_at` | `integer (timestamp)` | NOT NULL                 |
| `updated_at` | `integer (timestamp)` | NOT NULL                 |
| `deleted_at` | `integer (timestamp)` | nullable                 |

UUID PK: ✅. Soft delete: ✅. Timestamps: ✅.

#### `card_note_links`

| Column       | Type                  | Constraints               |
| ------------ | --------------------- | ------------------------- |
| `id`         | `text`                | PRIMARY KEY               |
| `card_id`    | `text`                | NOT NULL, FK → `cards.id` |
| `note_id`    | `text`                | NOT NULL, FK → `notes.id` |
| `created_at` | `integer (timestamp)` | NOT NULL                  |
| `updated_at` | `integer (timestamp)` | NOT NULL                  |
| `deleted_at` | `integer (timestamp)` | nullable                  |

UUID PK: ✅. Soft delete: ✅. Timestamps: ✅.

**Note:** There is no DB-level UNIQUE constraint on `(card_id, note_id)`. Idempotency is enforced in application code (`linkCardToNote` checks for existing non-deleted rows before inserting).

#### `tags`

| Column       | Type                  | Constraints      |
| ------------ | --------------------- | ---------------- |
| `id`         | `text`                | PRIMARY KEY      |
| `name`       | `text`                | NOT NULL, UNIQUE |
| `created_at` | `integer (timestamp)` | NOT NULL         |
| `updated_at` | `integer (timestamp)` | NOT NULL         |
| `deleted_at` | `integer (timestamp)` | nullable         |

UUID PK: ✅. Soft delete: ✅. Timestamps: ✅.

#### `card_tags`

| Column       | Type                  | Constraints               |
| ------------ | --------------------- | ------------------------- |
| `id`         | `text`                | PRIMARY KEY               |
| `card_id`    | `text`                | NOT NULL, FK → `cards.id` |
| `tag_id`     | `text`                | NOT NULL, FK → `tags.id`  |
| `created_at` | `integer (timestamp)` | NOT NULL                  |
| `updated_at` | `integer (timestamp)` | NOT NULL                  |
| `deleted_at` | `integer (timestamp)` | nullable                  |

UUID PK: ✅. Soft delete: ✅. Timestamps: ✅.

#### `settings`

| Column       | Type                  | Constraints |
| ------------ | --------------------- | ----------- |
| `key`        | `text`                | PRIMARY KEY |
| `value`      | `text`                | NOT NULL    |
| `updated_at` | `integer (timestamp)` | NOT NULL    |

**⚠ DEVIATION FROM DESIGN.md:** The `settings` table uses `key` as primary key (not a UUID `id`), and has no `created_at` or `deleted_at`. This intentionally deviates from the schema conventions in `DESIGN.md`, which state those fields are "non-negotiable" for every record. As a key-value store for application configuration, this deviation is pragmatic, but it is a deviation.

---

## 4. Repositories

### `src/db/repositories/decks.ts`

| Function        | Signature                                    | Description                                                          |
| --------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `getAllDecks`   | `() → Promise<Deck[]>`                       | Returns all non-deleted decks as a flat list                         |
| `getDeckById`   | `(id) → Promise<Deck \| null>`               | Returns a single non-deleted deck by id                              |
| `getChildDecks` | `(parentId \| null) → Promise<Deck[]>`       | Returns direct children of a deck, or top-level if null              |
| `getDeckPath`   | `(id) → Promise<Deck[]>`                     | Walks parent_id chain to return `[root, ..., self]` ancestry         |
| `createDeck`    | `({ name, parentId? }) → Promise<Deck>`      | Creates a new deck; builds path from parent                          |
| `updateDeck`    | `(id, { name?, examDate? }) → Promise<Deck>` | Updates name and/or exam date; calls `rebuildPaths` on rename        |
| `deleteDeck`    | `(id) → Promise<void>`                       | Soft-deletes deck + all descendants + their cards + their FSRS state |
| `rebuildPaths`  | `(id) → Promise<void>`                       | Recursively recomputes `path` for deck and live descendants          |

All functions are fully implemented. No stubs.

### `src/db/repositories/cards.ts`

| Function                   | Signature                                                           | Description                                                                      |
| -------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `getCardsByDeck`           | `(deckId) → Promise<Card[]>`                                        | Returns non-deleted cards for a deck                                             |
| `getCardById`              | `(id) → Promise<Card \| null>`                                      | Returns a single non-deleted card                                                |
| `getCardCountByDeck`       | `(deckId) → Promise<number>`                                        | Returns non-deleted card count for a deck                                        |
| `getCardsWithState`        | `(deckId) → Promise<{card, state}[]>`                               | Returns cards joined with FSRS state for a deck                                  |
| `getDueCount`              | `(deckId) → Promise<number>`                                        | Returns count of cards with `due ≤ now`; image occlusion cards count each region |
| `getCardsByDeckRecursive`  | `(deckId) → Promise<Card[]>`                                        | Returns cards for a deck and all live descendants via path matching              |
| `createCard`               | `({ deckId, cardType, front?, back?, clozeText? }) → Promise<Card>` | Inserts card + FSRS state atomically; soft-deletes card if FSRS insert fails     |
| `updateCard`               | `(id, { front?, back?, clozeText? }) → Promise<Card>`               | Updates mutable fields on a basic or cloze card                                  |
| `deleteCard`               | `(id) → Promise<void>`                                              | Soft-deletes a card                                                              |
| `createImageOcclusionCard` | `({ deckId, imageUrl, occlusionData }) → Promise<Card>`             | Creates image occlusion card; requires ≥1 region                                 |
| `updateImageOcclusionCard` | `(id, { imageUrl?, occlusionData? }) → Promise<Card>`               | Updates image and/or regions on an occlusion card                                |

All functions are fully implemented.

### `src/db/repositories/fsrs.ts`

| Function              | Signature                               | Description                                                      |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `getCardState`        | `(cardId) → Promise<FsrsState \| null>` | Returns FSRS state for a card                                    |
| `initialiseCardState` | `(cardId) → Promise<FsrsState>`         | Creates initial FSRS state using `ts-fsrs`'s `createEmptyCard()` |
| `updateCardState`     | `(cardId, params) → Promise<FsrsState>` | Persists updated scheduling values after a review                |

All functions are fully implemented.

### `src/db/repositories/notes.ts`

| Function         | Signature                                             | Description                                |
| ---------------- | ----------------------------------------------------- | ------------------------------------------ |
| `createNote`     | `({ title, deckId?, content? }) → Promise<Note>`      | Creates a new note                         |
| `getNoteById`    | `(id) → Promise<Note \| null>`                        | Returns a single non-deleted note          |
| `getAllNotes`    | `() → Promise<Note[]>`                                | Returns all non-deleted notes              |
| `getNotesByDeck` | `(deckId) → Promise<Note[]>`                          | Returns non-deleted notes linked to a deck |
| `updateNote`     | `(id, { title?, deckId?, content? }) → Promise<Note>` | Updates note fields                        |
| `deleteNote`     | `(id) → Promise<void>`                                | Soft-deletes a note                        |

All functions are fully implemented. JSON content is parsed/serialised in `mapNote` helper.

### `src/db/repositories/cardNoteLinks.ts`

| Function             | Signature                          | Description                                                  |
| -------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `linkCardToNote`     | `(cardId, noteId) → Promise<void>` | Creates link (idempotent — skips if non-deleted link exists) |
| `unlinkCardFromNote` | `(cardId, noteId) → Promise<void>` | Soft-deletes the link                                        |
| `getLinkedNotes`     | `(cardId) → Promise<Note[]>`       | Returns all non-deleted notes linked to a card               |
| `getLinkedCards`     | `(noteId) → Promise<Card[]>`       | Returns all non-deleted cards linked to a note               |

All functions are fully implemented.

### `src/db/repositories/tags.ts`

| Function            | Signature                                      | Description                                         |
| ------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `getAllTags`        | `() → Promise<Tag[]>`                          | Returns all non-deleted tags, sorted alphabetically |
| `getTagsForCard`    | `(cardId) → Promise<Tag[]>`                    | Returns all non-deleted tags for a card             |
| `getTagsForCards`   | `(cardIds[]) → Promise<Record<string, Tag[]>>` | Batch-fetches tags for multiple cards in one query  |
| `getCardsByTag`     | `(tagId) → Promise<Card[]>`                    | Returns all non-deleted cards with a given tag      |
| `getTagUsageCounts` | `() → Promise<Record<string, number>>`         | Returns count of non-deleted card_tags per tag      |
| `getOrCreateTag`    | `(name) → Promise<Tag>`                        | Gets or creates a tag by normalised name            |
| `addTagToCard`      | `(cardId, tagName) → Promise<void>`            | Adds a tag to a card (idempotent)                   |
| `removeTagFromCard` | `(cardId, tagId) → Promise<void>`              | Soft-deletes the card_tags link                     |
| `deleteTag`         | `(tagId) → Promise<void>`                      | Soft-deletes tag and all its card_tags rows         |

All functions are fully implemented.

### `src/db/repositories/settings.ts`

| Function         | Signature                              | Description                            |
| ---------------- | -------------------------------------- | -------------------------------------- |
| `getSetting`     | `(key) → Promise<string \| null>`      | Returns a setting value by key         |
| `setSetting`     | `(key, value) → Promise<void>`         | Upserts a setting (INSERT OR UPDATE)   |
| `getAllSettings` | `() → Promise<Record<string, string>>` | Returns all settings as a plain object |

All functions are fully implemented.

---

## 5. Stores

### `src/store/decks.ts`

**State shape:**

```ts
{
  decks: Deck[];
  cardCounts: Record<string, number>;  // deckId → card count
  loading: boolean;
  error: string | null;
}
```

**Actions:**
| Action | Description |
|---|---|
| `fetchDecks()` | Loads all decks + card counts |
| `createDeck(name, parentId?)` | Creates deck, refetches |
| `updateDeck(id, { name?, examDate? })` | Updates deck, refetches |
| `deleteDeck(id)` | Deletes deck + descendants, refetches |

All actions are fully implemented.

### `src/store/cards.ts`

**State shape:**

```ts
{
  cards: Card[];
  cardsWithState: CardWithStateRow[];  // { card, state }[]
  dueCount: number;
  currentDeckId: string | null;
  loading: boolean;
  error: string | null;
}
```

**Actions:**
| Action | Description |
|---|---|
| `fetchCardsByDeck(deckId)` | Loads cards + FSRS states + due count for a deck |
| `createCard({ deckId, cardType, ... })` | Creates basic/cloze card, refetches |
| `updateCard(id, params)` | Updates basic/cloze card, refetches |
| `deleteCard(id)` | Soft-deletes card, refetches |
| `createImageOcclusionCard(params)` | Creates image occlusion card, refetches |
| `updateImageOcclusionCard(id, params)` | Updates image occlusion card, refetches |

All actions are fully implemented.

### `src/store/notes.ts`

**State shape:**

```ts
{
  notes: Note[];
  currentNote: Note | null;
  loading: boolean;
  error: string | null;
}
```

**Actions:**
| Action | Description |
|---|---|
| `fetchAllNotes()` | Loads all notes; preserves `currentNote` if still in list |
| `fetchNotesByDeck(deckId)` | Loads deck-specific notes |
| `loadNote(id)` | Loads a single note into `currentNote` |
| `createNote({ title, deckId? })` | Creates note, prepends to list |
| `updateNote(id, params)` | Updates note, patches list and currentNote in-place |
| `deleteNote(id)` | Deletes note, removes from list, clears currentNote if matched |
| `clearCurrentNote()` | Sets `currentNote` to null |

All actions are fully implemented.

### `src/store/review.ts`

**State shape:**

```ts
{
  session: ReviewSession | null;
  examMode: boolean;
  examModeSession: ExamModeSession | null;
  flipped: boolean;
  loading: boolean;
  error: string | null;
  deckDueCounts: Record<string, number>;
}
```

**Actions:**
| Action | Description |
|---|---|
| `startSession(deckId)` | Fetches cards+states recursively, expands cloze/occlusion, filters to due cards, creates session |
| `startExamSession(deckId)` | Builds exam mode session (sorted by retrievability), creates session from top N cards |
| `flipCard()` | Sets `flipped = true` |
| `submitRating(rating)` | Applies FSRS via `applyRating`, persists to DB, advances session, resets `flipped` |
| `clearSession()` | Resets all session state |
| `loadDueCounts(deckIds[])` | Fetches due counts for multiple decks for deck-selection view |

All actions are fully implemented. Error in `submitRating` is caught and stored but session advances anyway.

### `src/store/settings.ts`

**State shape:**

```ts
{
  llmProvider: LlmProvider | null; // 'gemini' | 'openai' | 'ollama'
  llmApiKey: string | null;
  llmBaseUrl: string | null;
  llmModel: string | null;
  theme: Theme; // 'system' | 'light' | 'dark'
  loaded: boolean;
}
```

**Actions:**
| Action | Description |
|---|---|
| `loadSettings()` | Reads all settings from DB, parses into typed state |
| `saveLlmConfig(config)` | Persists LLM provider/key/url/model to DB and store |
| `saveTheme(theme)` | Persists theme preference to DB and store |

All actions are fully implemented.

### `src/store/tags.ts`

**State shape:**

```ts
{
  tags: Tag[];
  tagUsageCounts: Record<string, number>;  // tagId → count
  loading: boolean;
  error: string | null;
}
```

**Actions:**
| Action | Description |
|---|---|
| `fetchAllTags()` | Loads all tags and usage counts |
| `addTagToCard(cardId, tagName)` | Adds tag, refreshes tags and counts |
| `removeTagFromCard(cardId, tagId)` | Removes tag link, refreshes counts |
| `deleteTag(tagId)` | Deletes tag and all its card associations, refreshes |

All actions are fully implemented.

---

## 6. Library modules (`src/lib/`)

### `cloze.ts`

| Export                                | Status                                                      |
| ------------------------------------- | ----------------------------------------------------------- |
| `ClozeToken` (interface)              | ✅ Fully implemented                                        |
| `ClozeSegment` (type)                 | ✅ Fully implemented                                        |
| `parseClozeTokens(text)`              | ✅ Returns array of raw cloze token matches                 |
| `parseCloze(text)`                    | ✅ Returns flat array of text/cloze segments                |
| `getClozeIndices(text)`               | ✅ Returns sorted unique cloze indices                      |
| `isValidCloze(text)`                  | ✅ Returns true if ≥1 non-empty deletion exists             |
| `renderClozeFront(text, activeIndex)` | ✅ Replaces target with `[___]` or `[hint]`; reveals others |
| `renderClozeBack(text, activeIndex)`  | ✅ Wraps target answer in `**bold**`; reveals others        |
| `validateCloze(text)`                 | ✅ Returns null (valid) or error string                     |
| `renderCloze(text, hiddenIndex)`      | ⚠ **Deprecated alias** for `renderClozeFront`               |
| `renderClozeRevealed(text)`           | ⚠ **Deprecated** — reveals all deletions as plain text      |

### `cardExpansion.ts`

| Export               | Status                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| `expandCards(cards)` | ✅ Expands basic→1 item, cloze→N items per index, occlusion→N items per rect |

### `fsrs.ts`

| Export                             | Status                                                          |
| ---------------------------------- | --------------------------------------------------------------- |
| `ReviewRating` (type)              | ✅ `'again' \| 'hard' \| 'good' \| 'easy'`                      |
| `CardWithState` (interface)        | ✅ `{ card, state, activeIndex?, activeRectId?, noteContext? }` |
| `toFsrsRating(rating)`             | ✅ Maps string rating to ts-fsrs `Rating` enum                  |
| `scheduleCard(state)`              | ✅ Returns `RecordLog` for all four ratings                     |
| `getRetrievability(state, atDate)` | ✅ Returns 0–1 recall probability; 0 if never reviewed          |
| `applyRating(state, rating)`       | ✅ Returns updated FsrsState without persisting                 |
| `getDueCards(cards)`               | ✅ Filters to cards with `due ≤ now`                            |
| `previewNextReview(state, rating)` | ✅ Returns next due date for a rating without applying it       |

### `reviewSession.ts`

| Export                            | Status                                           |
| --------------------------------- | ------------------------------------------------ |
| `ReviewSession` (interface)       | ✅                                               |
| `ReviewedCard` (interface)        | ✅                                               |
| `createSession(deckId, dueCards)` | ✅ Creates session with linear queue             |
| `currentCard(session)`            | ✅ Returns current card or null                  |
| `advanceSession(session, rating)` | ✅ Immutably records rating and increments index |
| `isSessionComplete(session)`      | ✅ Returns true when index ≥ queue length        |
| `sessionSummary(session)`         | ✅ Returns rating counts and duration in seconds |

### `exam-mode.ts`

| Export                                                   | Status                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ExamModeCard` (interface)                               | ✅                                                                                                               |
| `ExamModeSession` (interface)                            | ✅                                                                                                               |
| `buildExamModeSession(deckId, examDate, dailyCapacity?)` | ✅ Fetches cards recursively, expands, ranks by ascending retrievability at examDate, estimates reviewable count |

### `formatDuration.ts`

| Export                         | Status                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `formatRelativeDuration(date)` | ✅ Returns human-readable string: `< 1 day`, `N day(s)`, `1 week`, `N weeks`, `N month(s)` |

### `settingsKeys.ts`

| Export          | Status                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- |
| `SETTINGS_KEYS` | ✅ Const object with keys `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `THEME` |

### `pdfjs.ts`

| Export     | Status                                                                   |
| ---------- | ------------------------------------------------------------------------ |
| `pdfjsLib` | ✅ Re-exports `pdfjs-dist` with `workerSrc` set to `/pdf.worker.min.mjs` |

### `tiptapUtils.ts`

| Export                   | Status                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `tiptapToPlainText(doc)` | ✅ Converts TipTap JSON to plain text; handles paragraphs, headings, code blocks, lists, inlineMath, hardBreak |

### `editor.ts`

| Export                 | Status                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `InlineMath`           | ✅ TipTap custom Node with `$...$` input rule, KaTeX NodeView                               |
| `createEditorConfig()` | ✅ Returns TipTap options with StarterKit, CodeBlockLowlight, InlineMath, DocumentEmbedNode |

### `documents/importDocx.ts`

| Export               | Status                                                             |
| -------------------- | ------------------------------------------------------------------ |
| `htmlToTipTap(html)` | ✅ Converts mammoth HTML output to TipTap JSON document            |
| `importDocx(file)`   | ✅ Converts .docx → TipTap JSON; returns title, content, plainText |

### `documents/importPdf.ts`

| Export            | Status                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `importPdf(file)` | ✅ Extracts text from PDF pages using pdfjs; returns title, content, plainText, pageCount |

### `documents/exportDocx.ts`

| Export                   | Status                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exportNoteToDocx(note)` | ✅ Converts TipTap JSON → `docx` Document, downloads as .docx. Handles paragraphs, headings, blockquotes, code blocks, bullet/ordered lists (nested). |

### `documents/exportPdf.ts`

| Export                  | Status                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `exportNoteToPdf(note)` | ✅ Converts TipTap JSON → jsPDF document with paginated layout; downloads as .pdf. |

### `llm/client.ts`

| Export                                       | Status                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `LlmMessage` (interface)                     | ✅                                                                                                                |
| `LlmConfig` (interface)                      | ✅                                                                                                                |
| `LlmNotConfiguredError`                      | ✅ Custom error class                                                                                             |
| `LlmApiError`                                | ✅ Custom error class with HTTP status                                                                            |
| `complete(messages, config, options?)`       | ✅ Non-streaming LLM call via OpenAI-compatible `/v1/chat/completions`                                            |
| `completeStream(messages, config, options?)` | ✅ Streaming LLM call; calls `onChunk` incrementally                                                              |
| `getLlmConfig()`                             | ✅ Reads from settings store; throws `LlmNotConfiguredError` if not configured or missing API key (except Ollama) |

### `llm/service.ts`

| Export                                | Status                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `PracticeTest` (type)                 | ✅                                                                           |
| `generateCards(params)`               | ✅ Calls LLM, parses JSON array of `{front, back}` or `{clozeText}`          |
| `generatePracticeTest(params)`        | ✅ Calls LLM, parses JSON `{questions:[...]}`                                |
| `explainAnswer(params)`               | ✅ Streaming call; parses `{explanation}` with incremental streaming preview |
| `suggestAlternativePhrasings(params)` | ✅ Calls LLM, parses JSON `{phrasings:[{front, back}]}`                      |

### `llm/prompts.ts`

| Export                                    | Status                                              |
| ----------------------------------------- | --------------------------------------------------- |
| `buildCardGenerationPrompt(params)`       | ✅ System + user messages for card generation       |
| `buildPracticeTestPrompt(params)`         | ✅ System + user messages for practice test         |
| `buildExplanationPrompt(params)`          | ✅ System + user messages for explanation           |
| `buildAlternativePhrasingsPrompt(params)` | ✅ System + user messages for alternative phrasings |

### `tags.ts`

| Export                   | Status                    |
| ------------------------ | ------------------------- |
| `normaliseTagName(name)` | ✅ `trim().toLowerCase()` |

---

## 7. Components

### `src/components/cards/`

| Component            | Props                                                           | Description                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BasicCardFront`     | `{ front, className? }`                                         | Renders `front` text via `MarkdownPreview`                                                                                                                                      |
| `BasicCardBack`      | `{ back, className? }`                                          | Renders `back` text via `MarkdownPreview`                                                                                                                                       |
| `ClozeCardFront`     | `{ clozeText, activeIndex?, className? }`                       | Renders `renderClozeFront` output via `MarkdownPreview`                                                                                                                         |
| `ClozeCardBack`      | `{ clozeText, activeIndex?, className? }`                       | Renders `renderClozeBack` output via `MarkdownPreview`                                                                                                                          |
| `ClozeHighlighter`   | `{ value, onChange }`                                           | `<textarea>` with colour-coded overlay for cloze tokens                                                                                                                         |
| `MarkdownPreview`    | `{ content, className? }`                                       | Renders Markdown + `$...$` KaTeX + DOMPurify sanitisation                                                                                                                       |
| `ImageOcclusionForm` | `{ imageUrl, occlusionData, onImageChange, onOcclusionChange }` | Wrapper coordinating image upload and `OcclusionEditor`                                                                                                                         |
| `OcclusionEditor`    | `{ imageUrl, value, onChange }`                                 | Canvas-based rectangle draw/select/resize/label tool                                                                                                                            |
| `OcclusionCardFront` | `{ imageUrl, occlusionData, activeRectId, className? }`         | Renders image with active rect occluded (dark overlay)                                                                                                                          |
| `OcclusionCardBack`  | `{ imageUrl, occlusionData, activeRectId, className? }`         | Renders image with active rect label revealed                                                                                                                                   |
| `CardEditor`         | `{ deckId, card?, onClose }`                                    | Modal for creating (no `card`) or editing (with `card`) basic/cloze/image_occlusion cards. Includes tag editor, LLM alternative phrasings. Type selector disabled in edit mode. |
| `CardList`           | `{ deckId, cardsWithState, cardTagsMap? }`                      | Animated list of `CardRow`s; manages `CardEditor` for editing                                                                                                                   |
| `CardRow`            | `{ card, state, tags?, onEdit, onDelete }`                      | Single card row: type badge, content preview, tag chips, due date, edit/delete buttons                                                                                          |

### `src/components/decks/`

| Component         | Props                                                                                                  | Description                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `DeckTree`        | `{ decks, highlightedDeckIds? }`                                                                       | Builds recursive tree, manages expand/collapse state and rename/delete modals          |
| `DeckRow`         | `{ deck, cardCount, hasChildren, isExpanded, highlighted?, onToggle, onNavigate, onDelete, onRename }` | Single deck row with expand toggle, name, card count, exam date, rename/delete buttons |
| `CreateDeckModal` | `{ isOpen, onClose, allDecks }`                                                                        | Animated modal for creating a deck with name + optional parent selector                |
| `DeleteDeckModal` | `{ isOpen, deckId, deckName, onClose }`                                                                | Confirmation modal for deck deletion                                                   |
| `RenameDeckModal` | `{ isOpen, deckId, currentName, onClose }`                                                             | Animated modal for renaming a deck                                                     |

### `src/components/layout/`

| Component       | Props          | Description                                                                                                                   |
| --------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`      | none           | Nav bar (Home, Decks, Review, Notes, Settings) with React Router `<Outlet>`; applies `data-theme` attribute based on settings |
| `ErrorBoundary` | `{ children }` | Class-based error boundary showing `UI.common.error` + reload button                                                          |

### `src/components/llm/`

| Component            | Props                                | Description                                                                                                        |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `GenerateCardsModal` | `{ note, onClose }`                  | Generates basic or cloze cards from note text via LLM; shows preview with per-card selection; saves to chosen deck |
| `PracticeTestModal`  | `{ subject, cards, notes, onClose }` | Generates multiple-choice or short-answer practice test from card/note text; reveals answers one-by-one            |

### `src/components/notes/`

| Component              | Props                                                                                  | Description                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NoteEditor`           | `{ note, onTitleChange, onContentChange, onImportAsContent }`                          | TipTap WYSIWYG editor with title input, `EditorToolbar`, and `ImportDocumentButton`                      |
| `NoteList`             | `{ notes, activeNoteId?, onSelect, onDelete }`                                         | Scrollable list of notes with linked deck name and updated-at label                                      |
| `EditorToolbar`        | `{ editor, afterActions? }`                                                            | Formatting toolbar (bold, italic, strikethrough, H1–H3, quote, code, HR, bullet/ordered lists)           |
| `ImportDocumentButton` | `{ editor, currentTitle, currentContent, onImportAsContent }`                          | File-picker button (`pdf`/`docx`); triggers `ImportDocumentModal`                                        |
| `ImportDocumentModal`  | `{ file, fileType, currentTitle, currentContent, editor, onClose, onImportAsContent }` | Choose between import-as-content (replace/append) or embed as document node                              |
| `DocumentEmbed`        | (TipTap NodeViewWrapper)                                                               | Inline PDF viewer (canvas via pdfjs with pagination) or docx viewer (mammoth HTML)                       |
| `DocumentEmbedNode`    | (TipTap Node extension)                                                                | Custom TipTap block node wrapping `DocumentEmbedNodeView`; attributes: `fileName`, `fileType`, `dataUrl` |

### `src/components/review/`

| Component         | Props                                      | Description                                                                                                        |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `ReviewCard`      | none (reads from `useReviewStore`)         | Card flipper with slide/flip animations; dispatches front/back for all card types; shows LLM explain panel on back |
| `RatingButtons`   | `{ state, onRate }`                        | Four FSRS rating buttons (Again/Hard/Good/Easy) with FSRS-computed next-due previews                               |
| `SessionComplete` | `{ summary }`                              | End-of-session screen showing total, per-rating breakdown, duration, back-to-decks button                          |
| `SessionProgress` | `{ reviewed, total }`                      | Animated progress bar with `reviewed/total` counter                                                                |
| `ExamModeWarning` | `{ isOpen, message, onProceed, onCancel }` | Animated modal warning about capacity constraint; "Review what I can" / "Cancel"                                   |

### `src/components/tags/`

| Component  | Props                                                     | Description                                                                                            |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `TagChip`  | `{ tag, onRemove?, onClick?, active? }`                   | Pill-shaped tag; read-only, removable, or clickable depending on props                                 |
| `TagInput` | `{ cardId?, pendingTags?, onPendingChange?, className? }` | Inline tag editor with autocomplete; edit mode (persists to DB) or pending mode (parent manages state) |

---

## 8. Pages

### `Home.tsx` — Route: `/`

Fully working. Fetches all decks, computes total due count, shows start-review button (disabled when 0 due), view-decks link. Shows global tag list below, each chip navigates to `/decks?tag=<id>`.

### `Decks.tsx` — Route: `/decks`

Fully working. Loads decks into `DeckTree`. Reads optional `?tag=<tagId>` query param to highlight decks containing cards with that tag. "New deck" button opens `CreateDeckModal`.

### `DeckDetail.tsx` — Route: `/decks/:id`

Fully working. Shows deck breadcrumb, card list with tag filtering (AND logic across multiple active tags), linked notes list, exam date picker, start-review and exam-revision buttons, add-card button, LLM practice test button. Handles `ExamModeWarning` for over-capacity exam sessions.

### `Review.tsx` — Route: `/review` and `/review/:deckId`

Fully working. Without `deckId`: deck-selection list with due counts. With `deckId`: starts session automatically, shows `SessionProgress` + `ReviewCard`; shows exam banner when in exam mode. Shows `SessionComplete` when session ends. Handles no-due-cards state.

### `Notes.tsx` — Route: `/notes`

Fully working. Two-pane layout (note list left, editor right). 1-second autosave debounce on title and content. "New note" creates and selects note. Export (PDF/DOCX) buttons. "Generate cards" opens `GenerateCardsModal`. `?note=<id>` query param selects a note on load.

### `Settings.tsx` — Route: `/settings`

**Partially implemented.** Implements:

- Theme selection (system/light/dark) via radio buttons — working.
- LLM provider/API key/base URL/model configuration — working, with test connection button.

**Not implemented** (keys exist in `ui-strings.ts` but Settings page has no UI for them):

- Language selector (`UI.settings.language`)
- Data management section: export data, import data, delete all data (`UI.settings.dataManagement`, `UI.settings.exportData`, `UI.settings.importData`, `UI.settings.dangerZone`, `UI.settings.deleteAllData`, `UI.settings.deleteAllDataConfirm`)

### `NotFound.tsx` — Route: `*`

Minimal working 404 page with heading and "Back to home" link.

---

## 9. Routing

Source: `src/router/index.tsx`.

| Path              | Component                 | Status                     |
| ----------------- | ------------------------- | -------------------------- |
| `/`               | `Home`                    | Working                    |
| `/decks`          | `Decks`                   | Working                    |
| `/decks/:id`      | `DeckDetail`              | Working                    |
| `/review`         | `Review` (deck selection) | Working                    |
| `/review/:deckId` | `Review` (active session) | Working                    |
| `/notes`          | `Notes`                   | Working                    |
| `/settings`       | `Settings`                | Partially working (see §8) |
| `*`               | `NotFound`                | Working                    |

All routes are nested inside `AppShell` which provides the nav bar.

---

## 10. `ui-strings.ts`

Top-level keys and sub-keys:

| Key        | Sub-keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Notes                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nav`      | `home`, `decks`, `review`, `notes`, `settings`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | All used                                                                                                                                                                          |
| `layout`   | `nav`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Used in `AppShell`                                                                                                                                                                |
| `home`     | `heading`, `dueToday`, `startReview`, `noCardsDue`, `viewDecks`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | All used                                                                                                                                                                          |
| `decks`    | `heading`, `loading`, `errorLoad`, `empty`, `createDeck`, `deckName`, `parentDeck`, `noParent`, `rename`, `deleteDeck`, `renameDeck`, `renameHeading`, `deleteHeading`, `newName`, `deleteConfirm`, `examDate`, `examDateNone`, `examDateSet`, `setExamDate`, `clearExamDate`, `examDateLabel`, `examRevision`, `examDatePast`, `cardCount`, `dueCount`, `pathSeparator`, `nested`, `expand`, `collapse`                                                                                                                                                                                                                                                                                                                                                                                                        | All used                                                                                                                                                                          |
| `review`   | `heading`, `flip`, `showAnswer`, `again`, `hard`, `good`, `easy`, `sessionComplete`, `cardsRemaining`, `exitSession`, `examModeActive`, `examWarning`, `sessionProgress`, `keyboardHint`, `noDueCards`, `noDueCardsDetail`, `startRevision`, `dueCards`, `sessionDuration`, `sessionTotal`, `backToDecks`, `ratingAgain`, `ratingHard`, `ratingGood`, `ratingEasy`, `examModeBanner`, `examDaysToGo`, `examToday`, `examPast`, `examModeCapacityWarning`, `reviewWhatICan`, `startExamRevision`                                                                                                                                                                                                                                                                                                                 | All used. `cardsRemaining`, `exitSession`, `examModeActive`, `examWarning` defined but not found in a component search — may be unused.                                           |
| `notes`    | `heading`, `empty`, `untitled`, `createNote`, `deleteNote`, `linkToDeck`, `generateCards`, `saving`, `saved`, `noNoteSelected`, `newNoteForDeck`, `linkedNotes`, `deleteConfirm`, `toolbarLabel`, `toolbarBold`, `toolbarItalic`, `toolbarStrike`, `toolbarHeading1`, `toolbarHeading2`, `toolbarHeading3`, `toolbarQuote`, `toolbarCode`, `toolbarRule`, `toolbarBulletList`, `toolbarOrderedList`, `titleInputLabel`, `importDocument`, `importAsNoteContent`, `importAsEmbed`, `importReplaceContent`, `importAppendContent`, `importProcessing`, `importErrorSize`, `importErrorType`, `importEmbedErrorSize`, `exportAsPdf`, `exportAsDocx`, `embedPageOf`, `embedPrev`, `embedNext`                                                                                                                       | All used. `linkToDeck` not found in component search — possibly unused.                                                                                                           |
| `settings` | `heading`, `appearance`, `theme`, `themeSystem`, `themeLight`, `themeDark`, `language`, `llm`, `llmProvider`, `llmApiKey`, `llmBaseUrl`, `llmModel`, `llmProviderGemini`, `llmProviderOpenAI`, `llmProviderOllama`, `testConnection`, `testConnectionSuccess`, `testConnectionFail`, `llmNotConfigured`, `llmNotConfiguredHint`, `goToSettings`, `modelPlaceholderGemini`, `modelPlaceholderOpenAI`, `modelPlaceholderOllama`, `showApiKey`, `hideApiKey`, `dataManagement`, `exportData`, `importData`, `dangerZone`, `deleteAllData`, `deleteAllDataConfirm`                                                                                                                                                                                                                                                  | ⚠ **`language`, `dataManagement`, `exportData`, `importData`, `dangerZone`, `deleteAllData`, `deleteAllDataConfirm`** are defined but the Settings page has no UI that uses them. |
| `cards`    | `loading`, `errorLoad`, `empty`, `addCard`, `editCard`, `deleteCard`, `deleteConfirm`, `typeSelectorLabel`, `typeBasic`, `typeCloze`, `frontLabel`, `backLabel`, `clozeLabel`, `front`, `back`, `clozeText`, `clozeHint`, `clozeSyntaxHint`, `clozeInvalid`, `clozeInvalidShort`, `previewLabel`, `preview`, `saveCard`, `frontRequired`, `backRequired`, `clozeRequired`, `cardCount`, `dueCount`, `nextDue`, `neverReviewed`, `typeImageOcclusion`, `imageUploadPrompt`, `imageUploadFormats`, `imageUploadErrorSize`, `imageUploadErrorFormat`, `imageReplaceButton`, `occlusionDrawMode`, `occlusionSelectMode`, `occlusionLabelPrompt`, `occlusionLabelConfirm`, `occlusionLabelCancel`, `occlusionNoRegions`, `occlusionRegionCount`, `occlusionDeleteHint`, `tags`, `addTag`, `noTags`, `tagPlaceholder` | ⚠ `noTags` is an empty string and appears to serve as a placeholder — not rendered anywhere.                                                                                      |
| `tags`     | `heading`, `deleteTag`, `deleteTagConfirm`, `usageCount`, `clearFilters`, `filteringBy`, `noTagsOnDeck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | ⚠ `noTagsOnDeck` is an empty string, not rendered anywhere. `deleteTag` and `deleteTagConfirm` are defined but there is no tag management UI beyond the per-card TagInput.        |
| `llm`      | `generateCards`, `generating`, `generatedCardsPreview`, `addSelected`, `cardType`, `cardCount`, `targetDeck`, `selectAll`, `deselectAll`, `explain`, `explanation`, `closeExplanation`, `practiceTest`, `practiceTestFormat`, `multipleChoice`, `shortAnswer`, `questionCount`, `generateTest`, `revealAnswer`, `suggestAlternatives`, `alternatives`, `applyAlternative`                                                                                                                                                                                                                                                                                                                                                                                                                                       | All used                                                                                                                                                                          |
| `common`   | `loading`, `error`, `save`, `cancel`, `delete`, `confirm`, `back`, `close`, `edit`, `rename`, `search`, `notFound`, `backToHome`, `reload`, `noResults`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | All used. `confirm`, `back`, `search` not found in a component search — possibly unused.                                                                                          |

---

## 11. Test coverage

```
npm test output: 5 test files, 61 tests — all passing
```

| Test file                       | Tests | Covers                                                                                                                                             | Status      |
| ------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `src/lib/cloze.test.ts`         | 29    | `parseClozeTokens`, `parseCloze`, `getClozeIndices`, `isValidCloze`, `renderClozeFront`, `renderClozeBack`, `validateCloze`, `renderClozeRevealed` | ✅ All pass |
| `src/lib/tiptapUtils.test.ts`   | 7     | `tiptapToPlainText` — empty doc, plain text, paragraph breaks, headings, code blocks, inlineMath, mixed content                                    | ✅ All pass |
| `src/lib/tags.test.ts`          | 6     | `normaliseTagName` — trim, lowercase, empty string                                                                                                 | ✅ All pass |
| `src/lib/cardExpansion.test.ts` | 5     | `expandCards` — basic (1 item), cloze 1-index (1 item), cloze 3-indices (3 items), occlusion N-rects (N items), mixed array                        | ✅ All pass |
| `src/lib/exam-mode.test.ts`     | 5     | `buildExamModeSession` — sort order, capacity when exam is today, capacity when past, cap at total, future capacity formula                        | ✅ All pass |

### Conspicuously untested

The following have **no test coverage at all**:

- All repository functions (`src/db/repositories/`) — no integration or unit tests
- All Zustand stores (`src/store/`) — no tests
- All React components and pages — no component tests
- `src/lib/fsrs.ts` — FSRS wrapper (`applyRating`, `getDueCards`, `previewNextReview`, etc.)
- `src/lib/reviewSession.ts` — session state machine
- `src/lib/formatDuration.ts` — duration formatting
- `src/lib/editor.ts` — TipTap editor config and InlineMath extension
- `src/lib/documents/` — all four import/export functions
- `src/lib/llm/` — client, service, prompts
- `src/db/client.ts` — SQLite initialisation, migration runner

---

## 12. What is complete vs. incomplete

| Feature                     | Status                                | Notes                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project scaffold            | **Complete**                          | Vite + React + TypeScript + CSS Modules + Zustand + Drizzle + sqlite-wasm                                                                                                                                      |
| SQLite client (OPFS)        | **Complete**                          | OPFS with in-memory fallback; migration runner; Drizzle proxy                                                                                                                                                  |
| Deck CRUD                   | **Complete**                          | Create, read, update (name + exam date), delete (recursive soft-delete)                                                                                                                                        |
| Deck nesting + paths        | **Complete**                          | `parent_id` + `path` maintained via `rebuildPaths` after any rename                                                                                                                                            |
| Card CRUD — basic           | **Complete**                          | Create, edit, delete with FSRS state initialisation                                                                                                                                                            |
| Card CRUD — cloze           | **Complete**                          | Create, edit, delete; ClozeHighlighter for syntax highlighting                                                                                                                                                 |
| Card CRUD — image occlusion | **Complete**                          | Canvas draw/select/resize tool; per-region review expansion                                                                                                                                                    |
| FSRS logic layer            | **Complete**                          | `ts-fsrs` wrapper with `applyRating`, `previewNextReview`, `getRetrievability`                                                                                                                                 |
| Review session engine       | **Complete**                          | Linear queue, flip, submit rating, FSRS persist, session summary                                                                                                                                               |
| Review UI                   | **Complete**                          | Keyboard (Space/1–4) + mouse/touch; slide + flip animations; LLM explain panel                                                                                                                                 |
| Exam Mode                   | **Complete**                          | Retrievability ranking, daily-capacity estimate, over-capacity warning modal                                                                                                                                   |
| Notes (TipTap editor)       | **Complete**                          | WYSIWYG with bold/italic/strike/headings/quote/code/lists; InlineMath (`$...$`); document embed node; autosave                                                                                                 |
| Note–card linking           | **Partial — no UI**                   | Repository (`linkCardToNote`, `unlinkCardFromNote`) and store are implemented. Note context is used in LLM explanations during review. But there is no UI for a user to manually link/unlink a card to a note. |
| Document import (PDF/.docx) | **Complete**                          | PDF via pdfjs-dist; .docx via mammoth; both import as TipTap content or embed inline                                                                                                                           |
| Document embed              | **Complete**                          | `DocumentEmbedNode` TipTap extension; PDF rendered on canvas with pagination; .docx rendered as HTML                                                                                                           |
| Document export             | **Complete**                          | PDF export (jsPDF) and .docx export (docx library) from TipTap note content                                                                                                                                    |
| LLM integration             | **Complete**                          | Card generation, practice tests, on-demand explanation (streaming), alternative phrasings; Gemini/OpenAI-compatible/Ollama                                                                                     |
| Auth0 integration           | **Not started**                       | No auth code anywhere                                                                                                                                                                                          |
| Sync backend                | **Not started**                       | No backend code anywhere                                                                                                                                                                                       |
| Settings page               | **Partial — data management missing** | Theme + LLM config done. Language selector, data export/import, and delete-all not implemented.                                                                                                                |
| Tauri desktop build         | **Not started**                       | No `src-tauri/` directory; no Tauri configuration                                                                                                                                                              |
| Capacitor mobile build      | **Not started**                       | No Capacitor configuration                                                                                                                                                                                     |

---

## 13. Known issues and deviations from DESIGN.md

1. **`settings` table violates schema conventions.** `DESIGN.md` states that every record must have `id` (UUID), `created_at`, `updated_at`, `deleted_at`. The `settings` table has only `key` (text PK), `value`, and `updated_at`. No UUID, no `created_at`, no soft delete. This is pragmatically reasonable for a key-value store, but it is a stated deviation.

2. **`react-katex` installed but never used.** Package is in `dependencies` and takes up bundle space, but no file imports from it. KaTeX is used directly via the `katex` package instead.

3. **`vite-plugin-static-copy` in `dependencies` instead of `devDependencies`.** This is a build-time Vite plugin. It should not be in `dependencies`.

4. **Two `eslint-disable-next-line react-hooks/exhaustive-deps` in `src/pages/Review.tsx` (lines 77 and 86).** Both are documented with inline explanations explaining why the omissions are safe (Zustand action references are stable). No other ESLint inline suppressions exist in the codebase.

5. **No `@ts-ignore` or `@ts-expect-error` anywhere in `src/`.** The codebase is clean of TypeScript suppression comments.

6. **`fsrs_state.rating_history` TypeScript type is `unknown`.** Drizzle infers `text` columns with `mode: 'json'` as `unknown`. The review store casts it at runtime using `Array.isArray(...)`. There is no TypeScript-level guarantee that the value is an array.

7. **`CardWithState` is defined in two places.** The authoritative definition is `src/lib/fsrs.ts` (interface with `activeIndex`, `activeRectId`, `noteContext`). A duplicate type with the same fields also exists in `src/types/index.ts` but is not imported anywhere — it is dead code.

8. **No DB-level UNIQUE constraint on `card_note_links(card_id, note_id)`.** Idempotency is enforced only in application code (`linkCardToNote` checks before insert). A concurrent double-insert could theoretically create duplicate rows.

9. **DESIGN.md specifies `.pptx` and `.xlsx` as supported import formats.** Only `.pdf` and `.docx` are implemented. `.pptx`/`.xlsx` import is not started.

10. **DESIGN.md lists "note summarisation" as an LLM capability.** There is no `summariseNote` function in `src/lib/llm/service.ts` and no UI for it. This capability is specified but not implemented.

11. **Settings page data management section is not implemented** despite `ui-strings.ts` defining seven keys for it (`dataManagement`, `exportData`, `importData`, `dangerZone`, `deleteAllData`, `deleteAllDataConfirm`, `language`).

12. **`parent_id` FK on `decks` is not declared in Drizzle schema.** The self-referential FK is noted in a comment but not declared with `.references(() => decks.id)`. Referential integrity is enforced only in application code.

13. **Keyboard shortcuts in review session have an `eslint-disable` comment.** The `useEffect` dependency array in `Review.tsx` intentionally omits `startSession`, `loadDueCounts`, and `clearSession` because they are stable Zustand references. This is documented inline and is safe, but it suppresses a lint rule.

14. **No test coverage for any repository, store, component, or page.** The 61 existing tests cover only pure functions in `src/lib/`. All database-touching and React-rendering code is untested.
