# Lacuna — Post-Course-Architecture Plan

## Document purpose

Successor to `new_features_list.md` (the Course Architecture Plan). Covers the close-out of
that plan (Phase 8 and its recorded deferrals) and the next feature arcs, in order:

1. **Arc 0 — Course architecture close-out** (detailed)
2. **Arc 1 — Sequence learning** (detailed; ordered lists first, lines mode as v2)
3. **Arc 2 — MCP server / agent surface** (outline; to be planned in full when reached)
4. **Arc 3 — Cram-mode overhaul** (outline; the document owed by Addendum 2 §G/§M)

Plugins and sync/collaboration are explicitly parked. Arc 2's design doubles as the
plugin-compatibility groundwork: the MCP tool surface over the repository layer is the
first — and for now only — extension point.

Detail rots (the Course plan needed two addenda), so only the arc currently being built
carries full detail. Outline arcs are scoped, not specified.

---

# Arc 0 — Course Architecture Close-out

> **Status (July 2026): complete.** All Phase 8 items, deferred debts and the add-lesson
> UI gap are implemented. The only remaining checklist item is the manual end-to-end pass
> (§0.1 item 6), which must be run by a human in the browser. Schema removal of the
> internal `decks`/`folders` tables remains explicitly out of scope (§0.3).

Finish what the Course plan started. No new features; the goal is one data model in the UI,
paid-down deferrals, and accurate documentation.

## 0.1 Remaining Phase 8 work

1. **Search page and command palette** — search Courses, Lessons and Notes, not just decks
   and cards. Results deep-link to `/course/:courseId/...` routes.
2. **Analytics page** — course-scoped: predicted exam-day trajectory across the course's
   deduplicated card set (per Addendum 2 §J), stability profile, review volume. Lesson-level
   breakdown (cards, mastery, completion per lesson).
3. **Help page** — rewrite for the Course/Lesson/Note model.
4. **Legacy deck-surface removal** — delete `DeckView.tsx`, `DeckSettings.tsx` and the
   `/deck/:deckId/*` routes (view, settings, card create/edit, learn). Deck-based learn and
   card-edit flows are replaced by their course/lesson equivalents, which already exist.
   `folderTree.ts` goes with them. The `decks`/`folders` tables remain in the schema for
   now (see 0.3) — this arc removes UI surfaces, not storage.
5. **Documentation** — `README.md` and `SPEC.md` still describe the deck world (folders,
   deck management, deck-scoped highlights). Rewrite for courses. Update `CHANGES.md`.
6. **End-to-end pass** — manual walkthrough of the full student journey (dashboard → path →
   lesson → notes → lesson learn → practice → checkpoint) plus import of a v1 share code
   and a pre-v9 backup.

## 0.2 Deferred debts to pay (from Addendum 2 §O and Phase 7 notes)

1. **Manual practice-node authoring UI** — teacher-facing creation/placement of manual
   `PracticeNode` records (rendering and unlock-gating logic already exist).
2. **Teacher-configured lesson session filters** — `/lesson/:lessonId/learn` currently
   serves new cards only; add the configured-filter path (due-only, mixed, custom).
3. **Course deletion undo** — replace the plain `confirm()` with the undo-toast pattern
   `DangerZoneSection` already implements for decks.
4. **`undoReview` and `lastInteractedAt`** — use the `ReviewUndo.kind` discriminator
   (recorded in Phase 6 for exactly this purpose) to restore the right entity's timestamp.

## 0.3 Explicitly out of scope for Arc 0

- Dropping the `decks`/`folders` tables and the internal backing-deck mechanism (the
  question bank's lazily created per-course bank deck depends on it). Schema removal is a
  separate, later migration once the course UI has soaked.
- v1 share-code import support stays (Addendum 2 §E behaviour unchanged).

## 0.4 Success criteria

1. No route, page, or sidebar entry exposes the deck/folder model.
2. Search, analytics and help are fully course-aware.
3. All four deferred debts closed.
4. README/SPEC/CHANGES accurate; all tests pass; `tsc -b` clean.

---

# Arc 1 — Sequence Learning (v1: ordered lists)

> **Status (July 2026): v1 slice complete.** `Sequence`/`SequenceItem` entities, the pure
> generation/regeneration module, repository CRUD with undo, full portability (backup,
> diagnostics, share-code v2), the sequence editor, and grouping/badging/read-only
> enforcement of generated cards across all management surfaces are implemented and
> documented (§5, §12–13 of `SPEC.md`; see `CHANGES.md`). **Schema correction:** §1.2 below
> still says v10 as originally planned, but v10 was taken in the meantime by
> `Course.lessonViewMode` (an unrelated change landed first), so sequences shipped at
> schema **v11** instead. §1.5's **v2 lines-mode slice remains open** — not started.

## 1.1 Motivation and approach

Some material is inherently ordered: the periodic table, taxonomic ranks, historical
timelines, procedural steps — and, later, scripted lines. Flat cards lose the order;
one giant "recite the list" card violates atomicity and grades terribly.

The established SRS answer is **overlapping cloze**: for a sequence A B C D, generate one
card per element, each cueing recall with a configurable window of preceding elements
("B, C → ?" answers D). Every element gets a turn as the recall target with local context
as the cue, which directly attacks the mid-sequence weakness predicted by the serial
position effect. Chunking is supported by letting a sequence be partitioned into named
groups (e.g. periods of the periodic table).

**Design principle: the Sequence is an authoring-time entity; FSRS sees only ordinary
cards.** Generation produces real `Card` rows scheduled individually by the existing
engine. No FSRS engine changes.

## 1.2 Data model

```typescript
interface Sequence {
  id: string;
  courseId: string;
  primaryLessonId: string | null;   // same semantics as Card.primaryLessonId
  name: string;
  description?: string;
  items: SequenceItem[];            // ordered; stored inline (sequences are small)
  cueWindow: number;                // preceding items shown as cue; default 2
  chunkLabels?: string[];           // optional named chunks; items reference by index
  createdAt: number;
}

interface SequenceItem {
  id: string;                        // stable across edits — anchors generated cards
  value: string;                     // Markdown; the recallable unit
  label?: string;                    // optional display key (e.g. "11" for Sodium)
  chunkIndex?: number;               // membership of a named chunk
}
```

`Card` gains one optional field:

```typescript
interface Card {
  // ...
  sequenceItemId?: string;  // present iff generated from a sequence item
}
```

- New table (schema v10): `sequences: 'id, courseId, primaryLessonId, createdAt'`.
- Additive migration only; no existing data changes.
- Generated cards are found via `sequenceItemId` prefix or a `cards.where` on a new
  compound approach — decide at implementation against Dexie index cost; a plain
  `sequenceItemId` index on `cards` is the default.
- Sequences ride through export/import/backups/diagnostics/share-code v2 like the six
  Phase-1 tables did (same additive pattern; older backups without the array still import).

## 1.3 Card generation rules

For a sequence with items `i₀ … iₙ` and `cueWindow = w`:

- One generated card per item. Front: the previous `min(w, position)` item values plus the
  sequence name and (if chunked) chunk label; back: the item value.
- The first item's card is cued by the sequence name/chunk alone ("First item of …?").
- If items carry `label`s, generate a second optional card class (toggle at sequence
  level): label → value ("Atomic number 11 → ?"), unordered, for key-value recall
  alongside positional recall.
- **Regeneration on edit** is the hard part and the reason `SequenceItem.id` is stable:
  - Item edited → update the generated card's content in place; FSRS memory state kept.
  - Item inserted/reordered → regenerate affected *fronts* (cue windows shifted) but keep
    each card's memory state, since the recall target is unchanged.
  - Item deleted → delete its card (with the standard undo pattern); regenerate
    neighbouring fronts.
- Generated cards are read-only in the card editor (edit the sequence instead), clearly
  badged, and deletable only via the sequence.

## 1.4 UI

1. **Sequence editor** (`/course/:courseId/sequence/new`, `/sequence/:sequenceId/edit`) —
   ordered item list with add/reorder/delete, per-item Markdown, optional labels, chunk
   management, cue-window setting, live preview of generated cards. Entry points from
   LessonView and the Question Bank alongside "Add card".
2. **LessonView / Question Bank** — sequences listed as grouped entities; generated cards
   grouped under their sequence rather than loose in the list.
3. **Learn mode** — no changes; generated cards flow through existing lesson/course
   sessions. The card renderer shows the cue items styled as context above the prompt.

## 1.5 v2 (same arc, second slice): lines mode

Scoped now, built after lists ship. Same `Sequence` machinery with a different skin:

- Items are lines; a `speaker` field per item; "my lines" marked so only those generate
  recall cards, with other speakers' lines serving purely as cue context (cue lines are
  the hinges — consistent with the actor-memory literature).
- **First-letter prompt mode**: a graded hint (initial letters of the answer) before full
  reveal, as a mid-step in the reveal flow.
- **Strict grading**: reuse the typing-answer comparison for verbatim checking; Yes/No
  self-grade remains the fallback.
- Script import assist (paste a script, split into speaker-tagged items) is a natural
  Arc 2 agent task; a basic manual splitter ships here.

Open design questions to resolve before the v2 slice: hint granularity (first letters vs
first words), how punctuation/case affect strict grading, and whether cue lines display
speaker names by default.

## 1.6 Risks

- **Regeneration correctness** (medium): stale fronts after reorder, or memory-state loss
  on edit. Mitigation: pure generation module with exhaustive tests before any UI; item-id
  anchoring; snapshot tests of regeneration diffs.
- **Card-count explosion** (low): a 118-item sequence is 118–236 cards. That is the point,
  but surface the count in the editor before saving.
- **Read-only generated cards** (low): every card surface (editor, bulk ops, question
  bank) must respect the badge; audit call sites.

## 1.7 Success criteria

1. Periodic-table case works end to end: author once, chunked by period, positional and
   label cards generated, scheduled by FSRS, edits preserve memory state.
2. No FSRS engine changes.
3. Sequences survive export/import/backup/share-code round-trips.
4. Lines mode (v2 slice) handles a real script scene with cue context and strict grading.

---

# Arc 2 — MCP Server / Agent Surface (outline)

To be planned in full after Arc 1. Scope decided so far:

- **Lacuna is an MCP server, not an agent host.** Users connect their own subscription
  agents (Claude Code, Codex, Copilot — all MCP clients) to it. No embedded SDK, no
  handling of anyone's credentials, no inference costs, no ToS entanglement.
- **Tool surface = the repository layer**, which was deliberately kept UI-independent
  (Course plan Addendum 2 §N.2): course/lesson/note/card/sequence CRUD, plus read/query
  tools (due counts, weak cards, analytics summaries). Same functions the UI buttons call;
  no parallel code path.
- **Transport-agnostic core, Electron-first hosting.** The Electron main process hosts a
  local MCP endpoint (stdio and/or streamable HTTP) and bridges to the renderer's
  IndexedDB via IPC. The server core must not assume Electron: a later local companion
  process (`npx lacuna-mcp`, browser tab connects out via WebSocket and the companion
  relays) can serve web users without any cloud. Browser tabs cannot accept inbound
  connections, so tab-only hosting is impossible; no cloud component is required or wanted.
- **This is the plugin-compatibility groundwork.** The MCP tool surface is the first
  extension point; a future plugin API should be shaped by what this surface turns out to
  need (auth/consent, tool granularity, schema versioning), not designed speculatively.
- Headline use cases: agent-generated courses from pasted source material; script-to-lines
  sequence generation; bulk card authoring and review-queue triage.
- Key questions for the full plan: consent/confirmation UX for destructive tools; IPC
  bridge design and write-conflict handling with a live UI; how much of analytics to
  expose read-only; versioning the tool schema against future plugin types.

---

# Arc 3 — Cram-Mode Overhaul (outline)

The document Addendum 2 §G and §M promised. To be planned after Arc 2 (or earlier if it
blocks users). Scope decided so far:

- Resolve cram's interaction with multiple `CourseExamDate` checkpoints: what "cram for
  the next assessment" means when several horizons apply to overlapping lesson scopes.
- Respect checkpoint `lessonIds`/`excludedCardIds` scoping when building the cram pool.
- Course-scoped cram entry points (path checkpoint node, course settings) replacing the
  deck-scoped study-dropdown origin.

---

# Cross-arc notes

- All arcs follow existing conventions: additive schema migrations with pre-migration
  snapshots, pure logic modules with tests before UI, British English, no emojis.
- Arc ordering is deliberate: Arc 0 gives one data model, Arc 1 stabilises the repository
  API that Arc 2 exposes, Arc 3 is self-contained.
- Each arc gets its own detailed plan (or addendum here) before implementation begins;
  outline sections above are scope agreements, not specifications.

*End of plan.*
