# Lacuna — Project State Audit

Generated on: 2026-03-17
Method: direct file reads + command output from this workspace only.

---

## 1) Directory tree

Full listing of `src/` files (no truncation):

```text
src/components/cards/BasicCardBack.tsx
src/components/cards/BasicCardFront.tsx
src/components/cards/CardEditor.module.css
src/components/cards/CardEditor.tsx
src/components/cards/CardFace.module.css
src/components/cards/CardList.module.css
src/components/cards/CardList.tsx
src/components/cards/CardRow.module.css
src/components/cards/CardRow.tsx
src/components/cards/ClozeCardBack.tsx
src/components/cards/ClozeCardFront.tsx
src/components/cards/ClozeHighlighter.module.css
src/components/cards/ClozeHighlighter.tsx
src/components/cards/ImageOcclusionForm.tsx
src/components/cards/MarkdownPreview.module.css
src/components/cards/MarkdownPreview.tsx
src/components/cards/OcclusionCard.module.css
src/components/cards/OcclusionCardBack.tsx
src/components/cards/OcclusionCardFront.tsx
src/components/cards/OcclusionEditor.module.css
src/components/cards/OcclusionEditor.tsx
src/components/decks/CreateDeckModal.module.css
src/components/decks/CreateDeckModal.tsx
src/components/decks/DeckRow.module.css
src/components/decks/DeckRow.tsx
src/components/decks/DeckTree.module.css
src/components/decks/DeckTree.tsx
src/components/decks/DeleteDeckModal.module.css
src/components/decks/DeleteDeckModal.tsx
src/components/decks/RenameDeckModal.tsx
src/components/layout/AppShell.module.css
src/components/layout/AppShell.tsx
src/components/layout/ErrorBoundary.tsx
src/components/llm/GenerateCardsModal.module.css
src/components/llm/GenerateCardsModal.tsx
src/components/llm/PracticeTestModal.module.css
src/components/llm/PracticeTestModal.tsx
src/components/notes/DocumentEmbed.module.css
src/components/notes/DocumentEmbed.tsx
src/components/notes/DocumentEmbedNode.ts
src/components/notes/EditorToolbar.module.css
src/components/notes/EditorToolbar.tsx
src/components/notes/ImportDocumentButton.tsx
src/components/notes/ImportDocumentModal.module.css
src/components/notes/ImportDocumentModal.tsx
src/components/notes/NoteEditor.module.css
src/components/notes/NoteEditor.tsx
src/components/notes/NoteList.module.css
src/components/notes/NoteList.tsx
src/components/review/ExamModeWarning.module.css
src/components/review/ExamModeWarning.tsx
src/components/review/RatingButtons.module.css
src/components/review/RatingButtons.tsx
src/components/review/ReviewCard.module.css
src/components/review/ReviewCard.tsx
src/components/review/SessionComplete.module.css
src/components/review/SessionComplete.tsx
src/components/review/SessionProgress.module.css
src/components/review/SessionProgress.tsx
src/components/settings/ConfirmDeleteModal.tsx
src/components/settings/ConfirmImportModal.tsx
src/components/settings/SettingsConfirmModal.module.css
src/components/tags/TagChip.module.css
src/components/tags/TagChip.tsx
src/components/tags/TagInput.module.css
src/components/tags/TagInput.tsx
src/db/DbProvider.tsx
src/db/client.ts
src/db/dbContext.ts
src/db/migrations/0000_friendly_energizer.sql
src/db/migrations/0001_hesitant_reaper.sql
src/db/migrations/index.ts
src/db/migrations/meta/0000_snapshot.json
src/db/migrations/meta/0001_snapshot.json
src/db/migrations/meta/_journal.json
src/db/repositories/admin.ts
src/db/repositories/cardNoteLinks.ts
src/db/repositories/cards.ts
src/db/repositories/decks.ts
src/db/repositories/fsrs.ts
src/db/repositories/notes.ts
src/db/repositories/settings.ts
src/db/repositories/tags.ts
src/db/schema.ts
src/hooks/useDb.ts
src/lib/cardExpansion.test.ts
src/lib/cardExpansion.ts
src/lib/cloze.test.ts
src/lib/cloze.ts
src/lib/dataExport.ts
src/lib/dataImport.ts
src/lib/documents/exportDocx.ts
src/lib/documents/exportPdf.ts
src/lib/documents/importDocx.ts
src/lib/documents/importPdf.ts
src/lib/editor.ts
src/lib/exam-mode.test.ts
src/lib/exam-mode.ts
src/lib/formatDuration.ts
src/lib/fsrs.ts
src/lib/llm/client.ts
src/lib/llm/prompts.ts
src/lib/llm/service.ts
src/lib/pdfjs.ts
src/lib/reviewSession.ts
src/lib/settingsKeys.ts
src/lib/tags.test.ts
src/lib/tags.ts
src/lib/tiptapUtils.test.ts
src/lib/tiptapUtils.ts
src/main.tsx
src/pages/DeckDetail.module.css
src/pages/DeckDetail.tsx
src/pages/Decks.module.css
src/pages/Decks.tsx
src/pages/Home.module.css
src/pages/Home.tsx
src/pages/NotFound.tsx
src/pages/Notes.module.css
src/pages/Notes.tsx
src/pages/Review.module.css
src/pages/Review.tsx
src/pages/Settings.module.css
src/pages/Settings.tsx
src/router/index.tsx
src/store/cards.ts
src/store/decks.ts
src/store/notes.ts
src/store/review.ts
src/store/settings.ts
src/store/tags.ts
src/styles/global.css
src/styles/tokens.css
src/types/index.ts
src/types/sqlite-wasm-worker1.d.ts
src/ui-strings.ts
```

---

## 2) Dependencies

### dependencies (exact from package.json)

```json
{
  "@sqlite.org/sqlite-wasm": "^3.51.2-build7",
  "@tiptap/extension-code-block-lowlight": "^3.20.1",
  "@tiptap/pm": "^3.20.1",
  "@tiptap/react": "^3.20.1",
  "@tiptap/starter-kit": "^3.20.1",
  "docx": "^9.6.1",
  "dompurify": "^3.3.3",
  "drizzle-orm": "^0.45.1",
  "framer-motion": "^12.36.0",
  "jspdf": "^4.2.0",
  "jspdf-autotable": "^5.0.7",
  "katex": "^0.16.38",
  "lowlight": "^3.3.0",
  "mammoth": "^1.12.0",
  "marked": "^17.0.4",
  "pdfjs-dist": "^5.5.207",
  "react": "^19.2.4",
  "react-dom": "^19.2.4",
  "react-router-dom": "^7.13.1",
  "ts-fsrs": "^5.2.3",
  "uuid": "^13.0.0",
  "zustand": "^5.0.11"
}
```

### devDependencies (exact from package.json)

```json
{
  "@eslint/js": "^9.39.4",
  "@tauri-apps/cli": "^2.10.1",
  "@types/dompurify": "^3.0.5",
  "@types/katex": "^0.16.8",
  "@types/node": "^24.12.0",
  "@types/react": "^19.2.14",
  "@types/react-dom": "^19.2.3",
  "@types/uuid": "^10.0.0",
  "@typescript-eslint/eslint-plugin": "^8.57.0",
  "@typescript-eslint/parser": "^8.57.0",
  "@vitejs/plugin-react": "^6.0.0",
  "@vitest/ui": "^4.1.0",
  "drizzle-kit": "^0.31.9",
  "eslint": "^9.39.4",
  "eslint-config-prettier": "^10.1.8",
  "eslint-plugin-react": "^7.37.5",
  "eslint-plugin-react-hooks": "^7.0.1",
  "eslint-plugin-react-refresh": "^0.5.2",
  "globals": "^17.4.0",
  "husky": "^9.1.7",
  "lint-staged": "^16.4.0",
  "prettier": "^3.8.1",
  "typescript": "~5.9.3",
  "typescript-eslint": "^8.56.1",
  "vite": "^8.0.0",
  "vite-plugin-static-copy": "^3.3.0",
  "vitest": "^4.1.0"
}
```

### Dependency audit notes

- Imported in source and present in package.json: all detected non-relative imports are present.
- Imported in source but missing from package.json: none found.
- Installed but appears unused in first-party source imports:
  - `@tiptap/pm` (not directly imported in `src/`; may still be transitive/runtime support for TipTap internals).

---

## 3) Database schema (`src/db/schema.ts`)

Schema conventions from DESIGN.md require every record to include `id` UUID PK + `created_at` + `updated_at` + nullable `deleted_at` soft delete.

### decks

- Columns:
  - `id: text` primary key
  - `name: text` not null
  - `parent_id: text` nullable
  - `path: text` not null
  - `exam_date: integer(timestamp)` nullable
  - `created_at: integer(timestamp)` not null default fn
  - `updated_at: integer(timestamp)` not null default fn
  - `deleted_at: integer(timestamp)` nullable
- UUID PK: implemented in repository via `uuidv4()`.
- Soft delete: yes (`deleted_at`).
- Timestamps: yes.

### cards

- Columns:
  - `id: text` primary key
  - `deck_id: text` not null, FK -> decks.id
  - `card_type: text enum('basic'|'cloze'|'image_occlusion')` not null
  - `front: text` not null
  - `back: text` not null
  - `cloze_text: text` nullable
  - `image_url: text` nullable
  - `occlusion_data: text(json)` nullable
  - `created_at`, `updated_at`, `deleted_at`
- UUID PK: implemented in repositories.
- Soft delete: yes.
- Timestamps: yes.

### fsrs_state

- Columns:
  - `id: text` primary key
  - `card_id: text` not null unique FK -> cards.id
  - `stability: real` not null
  - `difficulty: real` not null
  - `due: integer(timestamp)` not null
  - `last_review: integer(timestamp)` nullable
  - `rating_history: text(json)` not null default `[]`
  - `created_at`, `updated_at`, `deleted_at`
- UUID PK: yes.
- Soft delete: yes.
- Timestamps: yes.

### notes

- Columns:
  - `id: text` primary key
  - `deck_id: text` nullable FK -> decks.id
  - `title: text` not null
  - `content: text(json)` not null
  - `created_at`, `updated_at`, `deleted_at`
- UUID PK: yes.
- Soft delete: yes.
- Timestamps: yes.

### card_note_links

- Columns:
  - `id: text` primary key
  - `card_id: text` not null FK -> cards.id
  - `note_id: text` not null FK -> notes.id
  - `created_at`, `updated_at`, `deleted_at`
- UUID PK: yes.
- Soft delete: yes.
- Timestamps: yes.

### tags

- Columns:
  - `id: text` primary key
  - `name: text` not null unique
  - `created_at`, `updated_at`, `deleted_at`
- UUID PK: yes.
- Soft delete: yes.
- Timestamps: yes.

### card_tags

- Columns:
  - `id: text` primary key
  - `card_id: text` not null FK -> cards.id
  - `tag_id: text` not null FK -> tags.id
  - `created_at`, `updated_at`, `deleted_at`
- UUID PK: yes.
- Soft delete: yes.
- Timestamps: yes.

### settings

- Columns:
  - `key: text` primary key
  - `value: text` not null
  - `updated_at: integer(timestamp)` not null
- UUID PK: no (deviation).
- Soft delete: no (deviation).
- Timestamps: missing `created_at` (deviation).

### DESIGN.md convention deviations

- `settings` does not follow required `id + created_at + deleted_at` convention.
- `settings` uses hard deletes in admin repo (`db.delete(settings)`) instead of soft delete model.

---

## 4) Repositories (`src/db/repositories/`)

### `admin.ts`

- `softDeleteAllData(): Promise<void>` — soft-deletes all domain tables, then hard-deletes all rows in `settings`.

### `cardNoteLinks.ts`

- `linkCardToNote(cardId: string, noteId: string): Promise<void>` — creates link if active link does not already exist.
- `unlinkCardFromNote(cardId: string, noteId: string): Promise<void>` — soft-deletes the link.
- `getLinkedNotes(cardId: string): Promise<Note[]>` — returns non-deleted linked notes with parsed content.
- `getLinkedCards(noteId: string): Promise<Card[]>` — returns non-deleted linked cards.

### `cards.ts`

- `getCardsByDeck(deckId: string): Promise<Card[]>` — returns non-deleted cards in a deck.
- `getCardById(id: string): Promise<Card | null>` — fetches one non-deleted card.
- `getCardCountByDeck(deckId: string): Promise<number>` — counts non-deleted cards by deck.
- `getCardsWithState(deckId: string): Promise<Array<{ card: Card; state: FsrsState }>>` — inner-joins cards with fsrs state.
- `getDueCount(deckId: string): Promise<number>` — counts due items; image occlusion contributes by region count.
- `getCardsByDeckRecursive(deckId: string): Promise<Card[]>` — returns cards for deck + descendants using path prefix match.
- `createCard(params: { deckId: string; cardType: 'basic' | 'cloze'; front?: string; back?: string; clozeText?: string; }): Promise<Card>` — creates card, then initializes fsrs; rolls back via soft-delete on fsrs init failure.
- `updateCard(id: string, params: { front?: string; back?: string; clozeText?: string }): Promise<Card>` — updates mutable card fields.
- `deleteCard(id: string): Promise<void>` — soft-deletes card.
- `createImageOcclusionCard(params: { deckId: string; imageUrl: string; occlusionData: OcclusionData; }): Promise<Card>` — validates region count > 0, creates card, initializes fsrs.
- `updateImageOcclusionCard(id: string, params: { imageUrl?: string; occlusionData?: OcclusionData }): Promise<Card>` — updates image occlusion payload.

### `decks.ts`

- `getAllDecks(): Promise<Deck[]>` — returns all non-deleted decks.
- `getDeckById(id: string): Promise<Deck | null>` — returns one non-deleted deck.
- `getChildDecks(parentId: string | null): Promise<Deck[]>` — returns direct children (or top-level decks).
- `getDeckPath(id: string): Promise<Deck[]>` — returns root-to-node ancestry chain.
- `createDeck(params: { name: string; parentId?: string; }): Promise<Deck>` — creates top-level or nested deck and computes `path`.
- `updateDeck(id: string, params: { name?: string; examDate?: Date | null }): Promise<Deck>` — updates name/exam date and rebuilds paths on rename.
- `deleteDeck(id: string): Promise<void>` — recursively soft-deletes deck descendants and cascades to cards/fsrs rows.
- `rebuildPaths(id: string): Promise<void>` — recomputes `path` recursively for descendants.

### `fsrs.ts`

- `getCardState(cardId: string): Promise<FsrsState | null>` — fetches fsrs row by card id.
- `initialiseCardState(cardId: string): Promise<FsrsState>` — creates initial fsrs row using `createEmptyCard()`.
- `updateCardState(cardId: string, params: Partial<Omit<FsrsState, 'id' | 'card_id' | 'created_at'>>): Promise<FsrsState>` — updates fsrs scheduling fields.

### `notes.ts`

- `createNote(params: { title: string; deckId?: string; content?: object; }): Promise<Note>` — inserts note with default tiptap document if missing content.
- `getNoteById(id: string): Promise<Note | null>` — fetches note with parsed content.
- `getAllNotes(): Promise<Note[]>` — fetches non-deleted notes.
- `getNotesByDeck(deckId: string): Promise<Note[]>` — fetches non-deleted notes by deck id.
- `updateNote(id: string, params: { title?: string; deckId?: string | null; content?: object; }): Promise<Note>` — updates note fields.
- `deleteNote(id: string): Promise<void>` — soft-deletes note.

### `settings.ts`

- `getSetting(key: string): Promise<string | null>` — fetches setting value.
- `setSetting(key: string, value: string): Promise<void>` — upserts setting and updates timestamp.
- `getAllSettings(): Promise<Record<string, string>>` — returns key/value map.

### `tags.ts`

- `getAllTags(): Promise<Tag[]>` — returns non-deleted tags sorted by name.
- `getTagsForCard(cardId: string): Promise<Tag[]>` — returns tags on one card.
- `getTagsForCards(cardIds: string[]): Promise<Record<string, Tag[]>>` — batched tag fetch by card ids.
- `getCardsByTag(tagId: string): Promise<Card[]>` — returns cards associated with one tag.
- `getTagUsageCounts(): Promise<Record<string, number>>` — counts card-tag links per tag id.
- `getOrCreateTag(name: string): Promise<Tag>` — normalizes, finds existing, or inserts new tag.
- `addTagToCard(cardId: string, tagName: string): Promise<void>` — idempotently links tag to card.
- `removeTagFromCard(cardId: string, tagId: string): Promise<void>` — soft-deletes card-tag link.
- `deleteTag(tagId: string): Promise<void>` — soft-deletes tag and all links.

### Stub/incomplete flags

- No repository function is a stub or placeholder.

---

## 5) Stores (`src/store/`)

### `cards.ts`

- State: `cards`, `cardsWithState`, `dueCount`, `currentDeckId`, `loading`, `error`.
- Actions:
  - `fetchCardsByDeck(deckId)` — loads cards+states and due count.
  - `createCard(params)` — creates card then refetches current deck.
  - `updateCard(id, params)` — updates card then refetches.
  - `deleteCard(id)` — soft-deletes card then refetches.
  - `createImageOcclusionCard(params)` — creates occlusion card then refetches.
  - `updateImageOcclusionCard(id, params)` — updates occlusion card then refetches.

### `decks.ts`

- State: `decks`, `cardCounts`, `loading`, `error`.
- Actions:
  - `fetchDecks()` — loads decks and computes card counts per deck.
  - `createDeck(name, parentId?)` — creates deck then refetches.
  - `updateDeck(id, params)` — updates deck then refetches.
  - `deleteDeck(id)` — deletes deck subtree then refetches.

### `notes.ts`

- State: `notes`, `currentNote`, `loading`, `error`.
- Actions:
  - `fetchAllNotes()` — loads all notes and preserves `currentNote` if still present.
  - `fetchNotesByDeck(deckId)` — loads deck notes.
  - `loadNote(id)` — loads one note into `currentNote`.
  - `createNote(params)` — creates note and prepends it in state.
  - `updateNote(id, params)` — updates note in list/current pointer.
  - `deleteNote(id)` — deletes note and clears `currentNote` if needed.
  - `clearCurrentNote()` — clears selected note.

### `review.ts`

- State: `session`, `examMode`, `examModeSession`, `flipped`, `loading`, `error`, `deckDueCounts`.
- Actions:
  - `startSession(deckId)` — builds normal due-card session.
  - `startExamSession(deckId)` — builds exam-ranked session and queues up to estimated reviewable.
  - `flipCard()` — flips current card UI state.
  - `submitRating(rating)` — applies fsrs rating, persists state, advances session.
  - `clearSession()` — resets review session state.
  - `loadDueCounts(deckIds)` — loads due counts by deck.

### `settings.ts`

- State: `llmProvider`, `llmApiKey`, `llmBaseUrl`, `llmModel`, `theme`, `loaded`.
- Actions:
  - `loadSettings()` — reads persisted settings and parses JSON payloads.
  - `saveLlmConfig(config)` — normalizes and persists llm config.
  - `saveTheme(theme)` — persists theme setting.

### `tags.ts`

- State: `tags`, `tagUsageCounts`, `loading`, `error`.
- Actions:
  - `fetchAllTags()` — loads tags + usage counts.
  - `addTagToCard(cardId, tagName)` — adds tag then refreshes tags/counts.
  - `removeTagFromCard(cardId, tagId)` — removes link then refreshes usage counts.
  - `deleteTag(tagId)` — deletes tag then refreshes tags/counts.

### Stub/unimplemented flags

- No store action is a stub.

---

## 6) Library modules (`src/lib/`)

Status key: Implemented / Partial / Stub.

- `cardExpansion.ts`
  - `expandCards(...)` — Implemented.
- `cloze.ts`
  - `ClozeToken`, `ClozeSegment` — Implemented types.
  - `parseClozeTokens`, `parseCloze`, `getClozeIndices`, `isValidCloze`, `renderClozeFront`, `renderClozeBack`, `renderCloze`, `renderClozeRevealed`, `validateCloze` — Implemented.
- `dataExport.ts`
  - `exportAllData()` — Implemented.
- `dataImport.ts`
  - `importAllData(file)` — Implemented.
- `editor.ts`
  - `InlineMath` node extension — Implemented.
  - `createEditorConfig()` — Implemented.
- `exam-mode.ts`
  - `ExamModeCard`, `ExamModeSession` — Implemented interfaces.
  - `buildExamModeSession(...)` — Implemented.
- `formatDuration.ts`
  - `formatRelativeDuration(date)` — Implemented.
- `fsrs.ts`
  - `ReviewRating`, `CardWithState` — Implemented types.
  - `toFsrsRating`, `scheduleCard`, `getRetrievability`, `applyRating`, `getDueCards`, `previewNextReview` — Implemented.
- `pdfjs.ts`
  - `pdfjsLib` re-export with worker setup — Implemented.
- `reviewSession.ts`
  - `ReviewSession`, `ReviewedCard` — Implemented interfaces.
  - `createSession`, `currentCard`, `advanceSession`, `isSessionComplete`, `sessionSummary` — Implemented.
- `settingsKeys.ts`
  - `SETTINGS_KEYS` — Implemented.
- `tags.ts`
  - `normaliseTagName(name)` — Implemented.
- `tiptapUtils.ts`
  - `tiptapToPlainText(doc)` — Implemented.
- `documents/exportDocx.ts`
  - `exportNoteToDocx(note)` — Implemented.
- `documents/exportPdf.ts`
  - `exportNoteToPdf(note)` — Implemented.
- `documents/importDocx.ts`
  - `htmlToTipTap(html)` — Implemented.
  - `importDocx(file)` — Partial (supports DOCX conversion path only; no PPTX/XLSX import pipeline).
- `documents/importPdf.ts`
  - `importPdf(file)` — Partial (PDF text extraction; no OCR/image text handling).
- `llm/client.ts`
  - `LlmMessage`, `LlmConfig`, `LlmNotConfiguredError`, `LlmApiError` — Implemented.
  - `complete`, `completeStream`, `getLlmConfig` — Implemented.
- `llm/prompts.ts`
  - `buildCardGenerationPrompt`, `buildPracticeTestPrompt`, `buildExplanationPrompt`, `buildAlternativePhrasingsPrompt`, `buildSummarisationPrompt` — Implemented.
- `llm/service.ts`
  - `PracticeTest` type — Implemented.
  - `generateCards`, `generatePracticeTest`, `explainAnswer`, `suggestAlternativePhrasings`, `summariseNote` — Implemented (runtime depends on configured provider/api key).
  - `LlmNotConfiguredError`, `LlmApiError` re-export — Implemented.

Missing exports/stubs: none found.

---

## 7) Components (`src/components/`)

Component name, props, and current behavior.

### cards

- `BasicCardFront` — props: `{ front: string; className?: string }`; renders front markdown (fallback `—` if empty).
- `BasicCardBack` — props: `{ back: string; className?: string }`; renders back markdown (fallback `—` if empty).
- `ClozeCardFront` — props: `{ clozeText: string; activeIndex?: number; className?: string }`; renders cloze with hidden active deletion.
- `ClozeCardBack` — props: `{ clozeText: string; activeIndex?: number; className?: string }`; renders cloze with active deletion revealed.
- `ClozeHighlighter` — props: `{ text: string }`; highlights cloze tokens for editing preview.
- `MarkdownPreview` — props: `{ content: string; className?: string }`; markdown + KaTeX render with DOMPurify sanitize.
- `OcclusionCardFront` — props: `{ imageUrl: string; occlusionData: OcclusionData; activeRectId: string; className?: string }`; renders question side occlusion overlay.
- `OcclusionCardBack` — same shape as front; renders reveal side for active region.
- `OcclusionEditor` — props: `{ initialImageUrl?: string; initialOcclusionData?: OcclusionData; onChange: (imageUrl: string, occlusionData: OcclusionData) => void }`; draw/select/move/resize occlusion regions.
- `ImageOcclusionForm` — props: `{ imageUrl: string; occlusionData: OcclusionData; onChange: (...); validationError?: string | null }`; wraps editor in form UI.
- `CardRow` — props: `{ card; state; tags?; onEdit; onDelete }`; single card row with due metadata/actions.
- `CardList` — props: `{ deckId: string; cardsWithState; cardTagsMap? }`; renders animated list + edit/create controls.
- `CardEditor` — props: `{ deckId: string; card?: Card; onClose: () => void }`; modal for create/edit across basic/cloze/image occlusion, tags, note links, LLM alternatives.

### decks

- `DeckRow` — props: `{ deck; cardCount; hasChildren; isExpanded; highlighted?; onToggle; onNavigate; onDelete; onRename }`; row rendering for one deck.
- `DeckTree` — props: `{ decks: Deck[]; highlightedDeckIds?: Set<string> }`; recursive tree view with modals/actions.
- `CreateDeckModal` — props: `{ isOpen: boolean; onClose: () => void; allDecks: Deck[] }`; create deck UI.
- `RenameDeckModal` — props: `{ isOpen: boolean; deckId: string | null; currentName: string; onClose: () => void }`; rename UI.
- `DeleteDeckModal` — props: `{ isOpen: boolean; deckId: string | null; deckName: string; onClose: () => void }`; delete confirmation.

### layout

- `AppShell` — props: none; top nav + outlet and theme attribute handling.
- `ErrorBoundary` — props: `{ children: ReactNode }`; catches render errors and shows reload UI.

### llm

- `GenerateCardsModal` — props: `{ note: Note; onClose: () => void }`; generates cards from note text and inserts selected cards.
- `PracticeTestModal` — props: `{ subject: string; cards: CardWithStateRow[]; notes: Note[]; onClose: () => void }`; generates LLM practice test.

### notes

- `DocumentEmbedNodeView` (`DocumentEmbed.tsx`) — props: TipTap `NodeViewProps`; previews embedded PDF/DOCX attachments inline.
- `DocumentEmbedNode` (`DocumentEmbedNode.ts`) — TipTap node extension (not React component), used by editor config.
- `EditorToolbar` — props: `{ editor: Editor | null; afterActions?: ReactNode }`; formatting actions.
- `ImportDocumentButton` — props: `{ editor: Editor | null; currentTitle: string; currentContent: object; onImportAsContent: (...) => Promise<void> }`; upload/import trigger.
- `ImportDocumentModal` — props: `{ isOpen; onClose; onImport }`; import mode + file processing UI.
- `NoteEditor` — props: `{ note; onTitleChange; onContentChange; onImportAsContent }`; title input + tiptap editor.
- `NoteList` — props: `{ notes; activeNoteId?; onSelect; onDelete }`; selectable note list.

### review

- `ReviewCard` — props: none; current card display, flip/rating controls, keyboard handling, explanation flow.
- `RatingButtons` — props: `{ state: FsrsState; onRate: (rating: ReviewRating) => void }`; Again/Hard/Good/Easy with due previews.
- `SessionProgress` — props: `{ reviewed: number; total: number }`; progress bar + count.
- `SessionComplete` — props: `{ summary }`; session end summary and navigation.
- `ExamModeWarning` — props: `{ isOpen: boolean; message: string; onProceed: () => void; onCancel: () => void }`; exam capacity warning modal.

### settings

- `ConfirmDeleteModal` — props: `{ isOpen: boolean; onClose: () => void; onConfirm: () => void; busy?: boolean }`; dangerous action confirmation.
- `ConfirmImportModal` — props: `{ isOpen: boolean; onClose: () => void; onConfirm: () => void; busy?: boolean }`; import overwrite confirmation.

### tags

- `TagChip` — props: `{ tag; onRemove?; onClick?; active?: boolean }`; chip with optional remove and active state.
- `TagInput` — props: `{ cardId?: string; pendingTags?: Tag[]; onPendingChange?: (tags: Tag[]) => void; className?: string }`; tag editor for persisted or pending modes.

Stub/placeholder components: none found.

---

## 8) Pages (`src/pages/`)

- `Home.tsx` — renders due summary, review/deck CTAs, and tag shortcuts; status: working.
- `Decks.tsx` — renders deck tree, create deck modal, optional tag highlighting via query param; status: working.
- `DeckDetail.tsx` — deck breadcrumb/meta, exam date controls, review/exam/practice actions, card list with tag filters, linked notes; status: working/feature-rich.
- `Review.tsx` — deck selection or active session view, progress, completion screen, no-due states, exam banner; status: working.
- `Notes.tsx` — note list/editor, autosave, import/export, LLM generate/summarize modals; status: working.
- `Settings.tsx` — theme + LLM config/test + import/export + delete-all flows; status: working.
- `NotFound.tsx` — 404 page with home link; status: working.

Routes are defined in section 9.

---

## 9) Routing (`src/router/index.tsx`)

- Wrapper layout route: `element: <AppShell />`
- Child routes:
  - `/` -> `Home` (working)
  - `/decks` -> `Decks` (working)
  - `/decks/:id` -> `DeckDetail` (working)
  - `/review` -> `Review` (working)
  - `/review/:deckId` -> `Review` (working)
  - `/notes` -> `Notes` (working)
  - `/settings` -> `Settings` (working)
  - `*` -> `NotFound` (working)

No stub routes found.

---

## 10) `ui-strings.ts`

### Top-level keys and sub-keys

- `nav`: `home`, `decks`, `review`, `notes`, `settings`
- `layout`: `nav`
- `home`: `heading`, `dueToday`, `startReview`, `noCardsDue`, `viewDecks`
- `decks`: `heading`, `loading`, `errorLoad`, `empty`, `createDeck`, `deckName`, `parentDeck`, `noParent`, `rename`, `deleteDeck`, `renameDeck`, `renameHeading`, `deleteHeading`, `newName`, `deleteConfirm`, `examDate`, `examDateNone`, `examDateSet`, `setExamDate`, `clearExamDate`, `examDateLabel`, `examRevision`, `examDatePast`, `cardCount`, `dueCount`, `pathSeparator`, `nested`, `expand`, `collapse`
- `review`: `heading`, `flip`, `showAnswer`, `again`, `hard`, `good`, `easy`, `sessionComplete`, `cardsRemaining`, `exitSession`, `examModeActive`, `examWarning`, `sessionProgress`, `keyboardHint`, `noDueCards`, `noDueCardsDetail`, `startRevision`, `dueCards`, `sessionDuration`, `sessionTotal`, `backToDecks`, `ratingAgain`, `ratingHard`, `ratingGood`, `ratingEasy`, `examModeBanner`, `examDaysToGo`, `examToday`, `examPast`, `examModeCapacityWarning`, `reviewWhatICan`, `startExamRevision`
- `notes`: `heading`, `empty`, `untitled`, `createNote`, `deleteNote`, `linkToDeck`, `summarise`, `generateCards`, `saving`, `saved`, `noNoteSelected`, `newNoteForDeck`, `linkedNotes`, `deleteConfirm`, toolbar keys, import keys, export keys, embed paging keys
- `settings`: appearance/theme/language keys, llm provider keys, test connection keys, placeholders, data management keys, danger zone keys
- `cards`: full card editor/review/tag/occlusion keyset (including `noTags`, `preview`, `clozeSyntaxHint`)
- `tags`: `heading`, `deleteTag`, `deleteTagConfirm`, `usageCount`, `clearFilters`, `filteringBy`, `noTagsOnDeck`
- `llm`: generation/explanation/practice/summarization strings
- `common`: `loading`, `error`, `save`, `cancel`, `delete`, `confirm`, `back`, `close`, `edit`, `rename`, `search`, `notFound`, `backToHome`, `reload`, `noResults`

### Missing referenced keys

- From `grep` over `UI.<group>.<key>` usages in `src/`: no missing keys detected.

### Defined but currently unused keys (detected by static usage scan)

- `decks`: `examDateNone`, `examDateSet`, `dueCount`, `nested`
- `review`: `flip`, `cardsRemaining`, `exitSession`, `examModeActive`, `examWarning`
- `notes`: `linkToDeck`, `generateCards`
- `settings`: `llmNotConfigured`
- `cards`: `front`, `back`, `clozeText`, `clozeSyntaxHint`, `preview`, `noTags`
- `tags`: `deleteTag`, `deleteTagConfirm`, `noTagsOnDeck`
- `common`: `back`, `rename`, `search`

---

## 11) Test coverage

### Test files and most recent `vitest run` status

Latest run command: `npm run test -- --reporter=json --outputFile=vitest-report.json`

Result summary:

- Total tests: 61
- Passed: 61
- Failed: 0
- Pending/Todo: 0
- Overall status: PASS

Per file:

- `src/lib/cardExpansion.test.ts` — 5 tests — PASS
- `src/lib/cloze.test.ts` — 38 tests — PASS
- `src/lib/exam-mode.test.ts` — 5 tests — PASS
- `src/lib/tags.test.ts` — 6 tests — PASS
- `src/lib/tiptapUtils.test.ts` — 7 tests — PASS

### Coverage observations

Covered well:

- Cloze parsing/render/validation helpers.
- Card expansion behavior.
- Exam mode ranking/capacity logic.
- Tag normalization.
- TipTap -> plain text conversion.

Conspicuously untested:

- Database/repository layer (`src/db/repositories/*`).
- Zustand stores (`src/store/*`).
- Routing/pages/components UI behavior.
- LLM client/service (`src/lib/llm/*`).
- Import/export modules (`src/lib/dataImport.ts`, `src/lib/dataExport.ts`, `src/lib/documents/*`).
- SQLite client/migration bootstrap (`src/db/client.ts`).

---

## 12) What is complete vs. incomplete

| Feature                     | Status                                                           | Notes                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project scaffold            | Complete                                                         | Vite+React+TS app, routing, db provider, stores, pages, lint/test tooling present.                                                                  |
| SQLite client (OPFS)        | Partial — fallback to in-memory                                  | OPFS is implemented in `db/client.ts`, but falls back to `:memory:` when unavailable; desktop/mobile-specific DB backends are not implemented here. |
| Deck CRUD                   | Complete                                                         | Create/rename/delete, list tree, recursive delete, exam date update all present.                                                                    |
| Deck nesting + paths        | Complete                                                         | `parent_id` + `path`, rebuild logic on rename, recursive traversal implemented.                                                                     |
| Card CRUD — basic           | Complete                                                         | Create/update/delete + render/review flows implemented.                                                                                             |
| Card CRUD — cloze           | Complete                                                         | Syntax validation, parse/render, expansion per cloze index, editor/review implemented.                                                              |
| Card CRUD — image occlusion | Complete                                                         | Upload/draw/edit regions + expansion by region + review faces implemented.                                                                          |
| FSRS logic layer            | Complete                                                         | ts-fsrs wrapper + state repo update flow implemented.                                                                                               |
| Review session engine       | Complete                                                         | Queueing, rating submission, fsrs updates, summary, due filtering implemented.                                                                      |
| Review UI                   | Complete                                                         | Session view, progress, rating previews, no-due and complete states implemented.                                                                    |
| Exam Mode                   | Partial — no standalone scheduling layer beyond ranked pre-queue | Ranking by retrievability and capacity warning implemented; uses same review route/session model.                                                   |
| Notes (TipTap editor)       | Complete                                                         | CRUD, rich editor, autosave, toolbar, linked deck context implemented.                                                                              |
| Note–card linking           | Complete                                                         | Link/unlink repositories + editor integration + linked notes display implemented.                                                                   |
| Document import (PDF/.docx) | Partial — `.pptx`/`.xlsx` missing                                | PDF and DOCX import implemented; no PPTX/XLSX importer exists.                                                                                      |
| Document embed              | Partial — PDF and DOCX only                                      | Embedded document node/view implemented for imported file payloads; broader Office support not present.                                             |
| Document export             | Complete                                                         | Export to PDF and DOCX implemented.                                                                                                                 |
| LLM integration             | Partial — client-side provider config only                       | Provider-agnostic client and generation/explain/summarize/test features implemented; no hosted proxy tier/backend integration in this repo.         |
| Auth0 integration           | Not started                                                      | No Auth0 code/config found in source.                                                                                                               |
| Sync backend                | Not started                                                      | No sync API/backend implementation found.                                                                                                           |
| Settings page               | Complete                                                         | Theme, provider config, test connection, import/export, destructive reset implemented.                                                              |
| Tauri desktop build         | Partial — scaffold/config present                                | `src-tauri` scaffold and scripts exist; local web sqlite-wasm path remains primary app DB implementation.                                           |
| Capacitor mobile build      | Not started                                                      | No Capacitor config or mobile wrapper files found.                                                                                                  |

---

## 13) Known issues or deviations

### Deviations from DESIGN.md

- Schema convention deviation:
  - `settings` table does not have UUID `id`, `created_at`, or `deleted_at`.
  - This conflicts with DESIGN.md “every record must have id/created_at/updated_at/deleted_at”.
- Soft-delete policy deviation:
  - `softDeleteAllData()` hard-deletes `settings` rows (`db.delete(settings)`), while design says soft deletes only.
- Feature-scope deviation:
  - DESIGN.md import scope mentions PDF + Office docs including `.docx`, `.pptx`, `.xlsx`; code supports PDF and DOCX only.

### Potential implementation concerns

- User-facing string externalization is mostly followed, but there is at least one inline label string in JSX:
  - `aria-label="Deck path"` in `src/pages/DeckDetail.tsx` (not from `ui-strings.ts`).
- `src/types/index.ts` comments still say settings types are “not yet implemented”, but settings are implemented (comment drift).

### TypeScript suppressions / `any` / ESLint disables

- `@ts-ignore`: none found in `src/`.
- Explicit `any` usage (`: any`, `as any`, `<any>`, `any[]`): none found in `src/`.
- Inline ESLint disables found:
  - `src/pages/Review.tsx` has two `eslint-disable-next-line react-hooks/exhaustive-deps` comments.

---

## Definition-of-done checklist

- `docs/audit-current-state.md` exists and has been updated: yes.
- All requested sections (1-13) present: yes.
- Built from actual reads/commands: yes.
- Source files modified: no.
