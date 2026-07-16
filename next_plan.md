# Lacuna — Post-Course-Architecture Plan

## Document purpose

Successor to `new_features_list.md` (the Course Architecture Plan). Covers the close-out of
that plan (Phase 8 and its recorded deferrals) and the next feature arcs, in order:

1. **Arc 0 — Course architecture close-out** (detailed)
2. **Arc 1 — Sequence learning** (detailed; ordered lists first, lines mode as v2)
3. **Arc 2 — MCP server / agent surface** (outline; the next detailed build)
4. **Arc 3 — Cram-mode overhaul** (outline; the document owed by Addendum 2 §G/§M)
5. **Arc 4 — Lesson/Practice split, checkpoint-aware horizon & Study Now** (detailed)
6. **Arc 5 — UI consistency pass** (outline; cheap, may interleave at any point)
7. **Arc 6 — Media card types: audio and image occlusion** (outline)
8. **Arc 7 — Classroom distribution: versioned courses and re-import merge** (outline;
   depends on Arc 2)
9. **Arc 8 — Multi-device sync** (outline; design decision first)
10. **Arc 9 — Mobile experience and due-card reminders** (outline)

Plugins remain speculative pending a concrete pain point (see Arc 2). Sync/collaboration
is no longer parked outright: Arc 8 un-parks it as a design question to be settled before
any build.

FSRS parameter optimisation already uses the official binding trainer.
`src/fsrs/optimise.ts` fits weights via `@open-spaced-repetition/binding`'s
`computeParameters()` (fsrs-rs via WASM in a Web Worker, `src/workers/optimise.worker.ts`),
validated against FSRS ranges before being applied; see SPEC.md §8.1. An earlier June 2026
attempt at this on a deleted branch (`copilot/production-hardening-round-two`) predates
the current implementation and is superseded — no further action needed here.

Detail rots (the Course plan needed two addenda), so only the most recently delivered arc
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
2. **Lesson session filters** — superseded by Arc 4. Lesson study now has one deliberate
   contract: unseen lesson members in Simple mode. `Lesson.sessionFilter` remains only for
   legacy import compatibility and is not a user-configurable setting.
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
> schema **v11** instead. §1.5's **v2 lines-mode slice is now implemented** (data layer,
> editor, and study flow) pending a human end-to-end pass.

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

> **Status (July 2026): fully delivered — data layer, editor, and study flow.**
> Only a human end-to-end pass on a real script scene remains.
> `Sequence.mode`/`mySpeaker` and `SequenceItem.speaker` (additive, no schema bump —
> Dexie doesn't need one for un-indexed optional fields), the `isMyLine`-filtered
> generation/regeneration logic, the script-paste splitter, and the sequence editor's
> mode picker/speaker fields/"my speaker" control are implemented and tested
> (`src/db/sequenceGeneration.ts`, `src/db/scriptSplitter.ts`,
> `src/pages/SequenceEditor.tsx`, `src/components/sequences/ScriptPasteImport.tsx`;
> SPEC.md §5). The study-flow UI is also shipped: a two-step hint ladder — first letters
> (`src/utils/firstLetterHint.ts`) then first words of each clause
> (`src/utils/firstWordsHint.ts`), both in `src/components/learn/LineHint.tsx`, wired into
> `src/pages/LearnMode.tsx` with an `h` shortcut that advances the ladder — and strict
> typed grading via the global typing mode, with lines-mode detection in
> `src/db/linesModeCards.ts`. Hint usage is recorded as `ReviewLog.hintUsed` (additive,
> optional, no schema bump) and nudges the invisible silent-mode grade by a small tunable
> constant (`HINT_TIME_PENALTY_SEC`, `src/fsrs/grading.ts`) applied only to the value fed
> into `gradeFromResponse` — the persisted `responseTimeSec` and per-deck calibration both
> stay the true, unpenalised time.
>
> **Presets, shipped as a follow-up data layer** (`src/db/sequencePresets.ts`): six named
> presets (Ordered list, Poetry / verse, Script / dialogue, Speech / presentation,
> Procedure / checklist, Timeline) sit over the same two modes — no new generation path.
> This required making lines mode's speaker filtering optional: `isMyLine` now treats a
> speakerless item as always "mine", so poetry/speech reuse lines mode with zero speaker
> configuration; only script-preset items are filtered by `mySpeaker`. Poetry and speech
> are mechanically identical (same mode/cueWindow/no speakers) and ship as two rows only
> because the preset table makes that free — differentiated by name/description alone.
> `Sequence.presetId` (additive optional) persists the choice for redisplay when editing;
> `presetForSequence` infers a preset for pre-existing sequences from `mode`/`mySpeaker`.
> The sequence editor's mode picker became a preset picker; share codes carry `presetId`
> as an additive `pr` field, only when it can't be re-inferred from `m`/`ms`.

Same `Sequence` machinery with a different skin:

- Items are lines; a `speaker` field per item; "my lines" marked so only those generate
  recall cards, with other speakers' lines serving purely as cue context (cue lines are
  the hinges — consistent with the actor-memory literature). **Shipped:** cue lines
  display speaker names by default (`NAME: line`), resolving the open question below.
- **First-letter prompt mode**: a graded hint (initial letters of the answer) before full
  reveal, as a mid-step in the reveal flow. **Shipped, and extended into a two-step
  ladder:** a Hint button (keyboard `h`) on the card front for lines-mode cards, first
  showing `firstLetterHint`'s reduction ("To be, or not to be" -> "T b, o n t b"), then
  (button relabels to "More hint") `firstWordsHint`'s coarser reduction ("To be, or not
  to be, that is the question" -> "To…, or…, that…"); both steps ungraded, reset per
  card, capped at two steps (full reveal is a separate, existing action). Using either
  step sets `ReviewLog.hintUsed`, which nudges the silent-mode grade by
  `HINT_TIME_PENALTY_SEC` (1.5s) — see SPEC.md §10.
- **Strict grading**: reuse `src/utils/answerComparison.ts` (the "type your answer"
  comparison, `AnswerComparisonOptions.ignoreCase`/`ignorePunctuation`) for verbatim
  checking; Yes/No self-grade remains the fallback. **Shipped** via the global typing
  mode: lines-mode cards are plain `front_back` cards, so with the setting on 'type' the
  typed answer is diffed word-by-word against the line on reveal, feedback only.
- Script import assist (paste a script, split into speaker-tagged items) is a natural
  Arc 2 agent task; a basic manual splitter ships here. **Shipped:** `splitScript`
  (`src/db/scriptSplitter.ts`) plus the `ScriptPasteImport` preview/correction modal.

Open design questions, all now resolved: cue lines display speaker names by default;
hint granularity is first letters (punctuation preserved in place); strict grading is a
per-user **grading strictness** setting (`src/state/answerStrictness.ts`, lenient/
standard/exact, default lenient) next to the typing toggle in Settings, mapped to
`AnswerComparisonOptions` with no changes to the comparison algorithm itself.

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
  **Decision rule:** ship the MCP surface first; a plugin extension point is nominated only
  by a concrete pain point agents cannot achieve through pure data manipulation. No
  speculative extension points — each is a permanent API contract, and none ships until at
  least one concrete use case cannot be served any other way.
- **Candidate plugin extension points**, in predicted order of need: custom card
  types/renderers (audio, image occlusion, code, chemistry) and import/export formats
  first — both are "data in, but Lacuna cannot display/ingest it" problems MCP cannot
  solve; then custom grading/answer-comparison strategies (e.g. maths-expression
  equivalence) and hint providers. Study-session hooks (post-session triggers that can fire
  an MCP-connected agent) are a promising composition of the two systems. **Firm
  exclusion:** scheduler variants are not a plugin surface — FSRS is the product's spine,
  and swapping it multiplies support surface for near-zero benefit.
- Headline use cases: agent-generated courses from pasted source material; script-to-lines
  sequence generation; bulk card authoring and review-queue triage. Agent-side
  script-to-sequence generation will supersede the shipped manual script splitter (§1.5) as
  the primary import path once this arc lands.
- Key questions for the full plan: consent/confirmation UX for destructive tools,
  including scoping — per-agent permissions of the form "this agent may touch course X
  only"; IPC bridge design and write-conflict handling with a live UI; how much of
  analytics to expose read-only; versioning the tool schema against future plugin types.
- **Tool design requirement:** tools should be idempotent and diff-friendly, so
  cross-source agent workflows (e.g. diff lecture notes against an existing course, add
  only what is missing) are safe to re-run.

---

# Arc 2 (detailed) — MCP Server / Agent Surface, with Arc 5 interleaved

> Supersedes the Arc 2 outline above for implementation purposes. Arc 5's five items are
> folded in as warm-up/interstitial tasks between Arc 2 phases — they are independent of
> the MCP work, so they are spaced out rather than batched at the start.

## 2.1 Architectural decisions

**Package choice.** `@modelcontextprotocol/sdk` (the official TypeScript SDK) as a
dependency of the **Electron main process only** — it must not appear in the Vite/renderer
bundle or the Cloudflare web build, since neither hosts a server. `zod` is already a
dependency and is the SDK's expected schema library, so tool input schemas are written as
`z.object(...)` and passed straight to `server.registerTool`. No new schema-validation
library is introduced.

**Transport.** stdio only for this arc. Streamable HTTP is deferred (see Open Questions):
stdio has zero attack surface (no listening socket, no port conflicts, no CORS/CSP
interaction with the renderer's `connect-src 'self'`), matches how Claude Code/Codex/most
MCP clients discover local servers (a launched subprocess), and sidesteps agent-identity
entirely, since a stdio server has exactly one client per process by construction. The
transport-agnostic requirement from the outline is satisfied by keeping the tool-surface
core (§2.2) ignorant of transport; adding a Streamable HTTP transport later is additive in
`electron/mcp/server.ts` only, not a rewrite.

**Where tool handlers execute.** The renderer, always — it is the only process with
IndexedDB. The MCP server itself runs in the Electron **main** process (Node, so it can
own stdio), and every tool handler is a thin wrapper that round-trips a request to the
renderer over `ipcMain.handle`/`webContents.send` and awaits a correlated response. This
mirrors the existing worker-message-envelope precedent (`src/workers/*.worker.ts`) rather
than inventing a new RPC shape.

**Core module split** (all under `src/mcp/`, imported by both renderer and, via a thin
Node-side shim, `electron/mcp/`):

- `src/mcp/tools/*.ts` — pure tool **definitions**: name, description, zod input schema,
  and a handler typed as `(input, ctx: ToolContext) => Promise<ToolResult>`, where
  `ToolContext` carries the calling agent's grant (§2.4) and nothing transport-specific.
  These handlers run **inside the renderer** and call `src/db/repository.ts` /
  `src/db/read.ts` directly — same functions the UI calls, per the outline's "no parallel
  code path" requirement.
- `src/mcp/registry.ts` — the ordered tool list plus the versioned manifest (§2.5).
- `src/mcp/bridge/protocol.ts` — the IPC envelope shared by both processes: request
  `{ id: string; tool: string; input: unknown; agentId: string }`, response
  `{ id: string; ok: true; result: unknown } | { id: string; ok: false; error: McpToolError }`.
  `McpToolError` is a small discriminated union (`not_found | validation | forbidden |
  conflict | internal`) so the main-process side can map errors to proper MCP error
  results instead of leaking stack traces.
- `electron/mcp/server.ts` (Node-only, new tsconfig target) — constructs the SDK `Server`,
  registers every tool from `src/mcp/registry.ts` with a handler that dispatches over IPC
  (a one-shot reply channel keyed by the envelope's `id`), and owns the stdio transport
  lifecycle.
- Renderer side: `src/mcp/bridge/renderer.ts`, wired from `electron/preload.ts`'s
  `electronAPI`, listens for `mcp:invoke`, looks up the tool by name in
  `src/mcp/registry.ts`, executes it, and sends `mcp:invoke:reply`.
  **Renderer-not-ready handling:** the main process applies a fixed timeout (10s,
  configurable), returning an `internal` error with a "Lacuna window is not open or still
  loading" message if the renderer hasn't attached its listener yet — surfaced to the
  agent as a normal tool error, not a crash. The main process registers the MCP server and
  its tool list immediately at startup (tool listing doesn't need the renderer); only tool
  *execution* requires the window to be ready.

**Why not run the repository layer directly in main against a second Dexie instance?**
IndexedDB does not exist in Node; running Dexie there would mean a second storage engine
with its own copy of the data — a sync nightmare. Bridging to the single renderer-side
database is the only option consistent with "local-only, one source of truth."

## 2.2 Read-side module (new)

`src/db/read.ts` (new file) provides plain async functions with zero React dependency,
built directly on Dexie and the existing pure analytics modules (`src/fsrs/eligibility.ts`,
`src/fsrs/objective.ts`, `src/fsrs/leech.ts`, `src/fsrs/stats.ts`,
`src/course/headerStats.ts`, `src/course/studyPools.ts`, with `src/db/diagnostics.ts` as
the template for touching Dexie without a hook). This is the non-React counterpart to
`src/state/useData.ts`/`useCourseData.ts`, not a replacement — the hooks keep using
`useLiveQuery` as today; `read.ts` is purely for MCP (and incidentally usable by future
non-React callers).

Planned functions (grouped, not exhaustive — finalised in Task 2):
`listCourses`, `getCourse`, `listLessons(courseId)`, `getLesson`, `listCardsForCourse`,
`listCardsForLesson`, `getCard`, `listDueCards(courseId, limit?)` (wraps
`dueCards`/`studyPool`), `getWeakCards(courseId, limit?)` (wraps `scoreCard`/leech
detection), `getCourseStats(courseId)` (wraps `computeStudyStats`/`headerStats`),
`listSequences(courseId)`, `getSequence`, `listNotes(lessonId)`, `listPracticeNodes`,
`listCourseExamDates`, `diagnosticsSummary(courseId?)` (thin wrapper on
`gatherCounts`-style logic scoped to a course rather than the whole DB).

## 2.3 Tool inventory

Tools are grouped by risk tier, which drives the consent model (§2.4). Every tool name is
`lacuna.<verb>_<noun>` (snake_case noun, matching MCP convention).

**Read/query tools (no consent gate beyond course scope; see §2.4 for the implicit read
grant):**
`lacuna.list_courses`, `lacuna.get_course`, `lacuna.list_lessons`, `lacuna.list_cards`,
`lacuna.get_card`, `lacuna.list_due_cards`, `lacuna.get_weak_cards`,
`lacuna.get_course_stats`, `lacuna.list_sequences`, `lacuna.get_sequence`,
`lacuna.list_notes`, `lacuna.diagnostics_summary`.

**Content CRUD tools (create/update; consent-gated per course, snapshot+undo not
required since these are additive or idempotent by construction):**
`lacuna.create_course`, `lacuna.update_course`, `lacuna.create_lesson`,
`lacuna.update_lesson`, `lacuna.create_note`, `lacuna.update_note`,
`lacuna.create_card` (wraps `createCourseCard`/`createLessonCard` selected by an optional
`lessonId` input), `lacuna.update_card`, `lacuna.link_card_to_lesson` (wraps the
already-idempotent `linkCardToLesson`), `lacuna.create_sequence`, `lacuna.update_sequence`,
`lacuna.create_course_exam_date`, `lacuna.update_course_exam_date`.

**Destructive/bulk tools (consent-gated, always paired with the repository's existing
snapshot/undo primitives so the renderer can offer an in-app undo toast identical to the
DangerZone pattern, even though the caller is an agent):**
`lacuna.delete_card` (single/bulk via `ids: string[]`, uses `snapshotCards`/`deleteCards`),
`lacuna.delete_lesson`, `lacuna.delete_course` (uses `snapshotCourse`/`deleteCourse`),
`lacuna.delete_sequence` (uses `snapshotSequence`), `lacuna.suspend_cards`,
`lacuna.set_cards_flag`, `lacuna.reschedule_cards`.

**Diff/preview tool (new, not a thin repository wrapper — the diff-friendliness
requirement from the outline):**
`lacuna.diff_import_preview(courseId, items: {front, back, lessonId?}[])` — pure function
(new `src/mcp/diffImport.ts`, tested standalone) that compares proposed cards against
existing ones via the same duplicate-detection logic `checkDuplicatesBatch` already uses,
returning `{toCreate, toSkip, toUpdate}` without writing anything. `lacuna.import_cards`
then takes the same shape and actually writes, skipping items already present — the
"re-run safely" tool the script-to-sequence and lecture-notes-diff use cases need.

**Explicitly excluded from the tool surface (documented in `src/mcp/registry.ts` as a
comment, not just an absence):**
- `noteAnnotations` CRUD — device-local by design, no agent use case yet.
- Raw FSRS state writes (`state`, `stability`, `difficulty`, `due`) — `update_card`
  accepts only content fields (`front`, `back`, `tags`, `flagged`); scheduling stays the
  engine's exclusive write path. `reschedule_cards` exposes the existing bounded
  `rescheduleCards` helper instead of raw field writes.
- `recordReview`/`undoReview` — an agent grading the user's recall on their behalf would
  corrupt the memory model; review recording stays a human-only, in-app action.
- Practice-node/milestone mutation beyond exam dates — path/curriculum structure is judged
  too consequential for v1; revisit once usage data exists.
- Backup/restore/share-code tools — already have a full UI flow; not a natural agent
  shape; out of scope for this arc.

## 2.4 Consent / permissions model

**Agent identity.** stdio has no built-in identity, and client-supplied `clientInfo.name`
is spoofable, so it is not a security boundary worth building on. Grants are therefore
**per Lacuna-launched MCP server process**, scoped by course, and expire when the server
process exits (re-launching the client's MCP connection re-prompts). Deliberately
conservative for v1; durable multi-agent identity is flagged as a v2 decision (Open
Questions).

**Data model.** `interface McpGrant { courseId: string; scope: 'read' | 'write' |
'destructive'; grantedAt: number; label?: string }`. `'destructive'` implies `'write'`
implies `'read'` (ordinal, not a set of booleans, since the tiers are strictly nested per
§2.3). Grants are process-scoped, so they live in an in-memory main-process `Map`
(`electron/mcp/grants.ts`), not Dexie — they must not survive relaunch. (If Task 11's UI
design finds session-persistence is actually wanted, that is a within-task decision, not a
re-plan.)

**Gating.** Every tool handler receives `ctx.grant` resolved from the tool's target
`courseId` (every tool takes an explicit `courseId`, or a `cardId`/`lessonId` the handler
resolves to one). If no grant at the required tier exists, the handler returns a
`forbidden` `McpToolError` whose message names the missing scope and course — so a
well-behaved agent can tell the user "I need write access to course X, please grant it in
Lacuna" and retry rather than looping.

**Renderer UI surface (Task 11).** A new Settings section, `settings/McpSection.tsx`,
following the existing extraction pattern, shown only when `window.electronAPI?.isElectron`.
It shows server status (`electronAPI.mcp.getStatus()`), the current process's grants
(course name + scope), and grant/revoke controls. Because a tool call can arrive before
the user has visited Settings, the *first* write/destructive call for an ungranted course
triggers a **blocking consent prompt in the renderer** (new `McpConsentPrompt` component,
reusing `ConfirmInline` from Task 1), and the IPC round-trip awaits the user's decision
(bounded by the same timeout, after which it fails closed as `forbidden`). **Write and
destructive tools block on synchronous human consent the first time per course per
process; read tools do not prompt at all** — read access is granted implicitly on first
read-tool call with a lighter, non-blocking toast, since blocking every read would make
the agent unusable. Destructive tools additionally always produce an in-app undo toast
after execution, so even a consented destructive call remains one click from reversal.

## 2.5 Schema/versioning

`src/mcp/registry.ts` exports `MCP_TOOL_SURFACE_VERSION = 1` (integer, independent of
`CURRENT_SCHEMA_VERSION` — this versions the *tool contract*, not the Dexie schema),
returned by a `lacuna.get_server_info` tool (name, app version, tool-surface version) so
an agent can detect a stale cached tool list. Bumped only on a breaking change to an
existing tool's shape or removal of a tool; additive new tools do not bump it. No
dual-version serving — MCP clients re-fetch the tool list every connection and there is
exactly one server instance per install.

## 2.6 Electron wiring

- New `electron/mcp/` directory, built by its own `tsc -p electron/tsconfig.mcp.json` step
  (NodeNext, matching `electron/tsconfig.json`, but a separate project so the SDK's types
  don't leak into the preload's CJS build).
- `package.json`: `@modelcontextprotocol/sdk` under `dependencies` (it must ship in the
  packaged app); `typecheck`/`electron:dev`/`electron:build*` scripts gain the
  `tsc -p electron/tsconfig.mcp.json` step alongside the existing two `tsc` calls.
- `electron/main.ts` starts the MCP server after `app.whenReady()` and window creation
  (needs `mainWindow.webContents` for the bridge), guarded by the existing single-instance
  lock so at most one stdio server ever runs. No change to `installSecurityHeaders` — the
  MCP server is Node-side and never touches the renderer's `connect-src`.
- `electron/preload.ts` gains an `mcp` namespace on `electronAPI` (`getStatus`, `onInvoke`,
  `reply`, `onGrantRequest`, `respondToGrantRequest`), keeping the existing narrow-surface
  pattern (no raw `ipcRenderer` passthrough).
- The web (Cloudflare) build is untouched: nothing under `src/` imports
  `electron/mcp/server.ts`, so Vite never sees the SDK. Verify with a web build after
  Task 9 as a regression check.

## 2.7 Testing strategy

- **`src/db/read.ts`** — Vitest + `fake-indexeddb/auto`, same harness as
  `repository.test.ts`, seeding via existing repository functions.
- **`src/mcp/tools/*.ts`** — unit tests calling handlers directly with a stub
  `ToolContext` against the fake-IndexedDB repository layer — no IPC, no SDK, no Electron.
  This is the bulk of coverage and runs in the normal Vitest suite.
- **`src/mcp/diffImport.ts`** — pure-function, table-driven tests (create/skip/update
  cases) — same "exhaustive tests before any UI" principle as Arc 1's regeneration module.
- **`electron/mcp/*`** — not meaningfully unit-testable without a real MCP client; covered
  by the manual smoke-test task (Task 13), consistent with the existing treatment of
  `electron/` (no test files exist there today).
- **Consent flow** — `McpConsentPrompt`/`McpSection` get component tests with mocked
  `electronAPI.mcp`, colocated per convention.

## 2.8 Out of scope for this arc

- The `npx lacuna-mcp` WebSocket companion process for web/browser users — the core stays
  transport-agnostic so this remains additive later, but it is not built now.
- Streamable HTTP transport (see Open Questions).
- Durable multi-agent identity (distinguishing Claude Code from Codex across sessions).
- Any plugin extension point — per the outline's decision rule.
- Study-session hooks (post-session agent triggers).
- Any change to `src/fsrs/` scheduling logic.

## 2.9 Task list

Each task is scoped for one subagent, ends in one commit, and (except pure-refactor Arc 5
tasks) includes its own tests. Arc 5 items are interleaved as noted.

1. **[Arc 5.1] Shared `ConfirmInline` component.** Extract the two-step inline confirm
   from `src/components/notes/NoteRow.tsx` (~88) and `src/pages/Settings.tsx`
   (`confirmRestore`, ~1150) into `src/components/ui/ConfirmInline.tsx` (props: `label`,
   `confirmLabel`, `onConfirm`, `onCancel`, `variant?: 'default' | 'destructive'`), with a
   colocated test. Replace the two originals and the six `window.confirm()` sites
   (`SequenceEditor.tsx:287`, `settings/LessonManagementSection.tsx:46`,
   `settings/ExamDatesSection.tsx:70`, `course/PracticeNodeEditor.tsx:74`,
   `settings/PracticeNodesSection.tsx:74`, `cards/LessonCardsSection.tsx:57`). Also used
   later by `McpConsentPrompt` (Task 11), so doing it first avoids rework.

2. **`src/db/read.ts` — read-side query module.** Implement §2.2's function list. No
   MCP/Electron dependency — must run in plain Vitest. Full unit-test coverage with
   `fake-indexeddb/auto`.

3. **Read/query tool definitions + registry skeleton.** Add `@modelcontextprotocol/sdk`
   (pinned, no `^` range); create `src/mcp/registry.ts`, `src/mcp/bridge/protocol.ts`
   (envelope types only), and `src/mcp/tools/read.ts` implementing the read/query group as
   thin wrappers over Task 2's `read.ts`. `ToolContext`/`McpToolError` types land here.
   Unit tests call handlers directly with a stub context.

4. **Content CRUD tool definitions.** The create/update group from §2.3 as thin wrappers
   over `repository.ts`. Unit tests per tool, including one asserting
   `link_card_to_lesson` stays idempotent.

5. **[Arc 5.2] Warning colour tokens.** Add `--warning`/`--warning-fg` to `src/index.css`
   (light block, dark block, `@theme` alias) following the `--positive` pattern. Replace
   all 14 `amber-*` literals across the nine files (`ProgressBar.tsx:10`,
   `CourseCard.tsx:162`, `StudySignals.tsx:205`, `UnifiedImportPanel.tsx:585,862`,
   `ScriptPasteImport.tsx:117`, `CardEditor.tsx:543,545`, `HelpPage.tsx:58`,
   `LearnMode.tsx:1904,1910,2312`, `SequenceEditor.tsx:587`). Spot-check light and dark.

6. **Destructive/bulk tools + diff/preview tool.** `src/mcp/diffImport.ts` (pure,
   table-driven-tested against `checkDuplicatesBatch`'s logic),
   `lacuna.diff_import_preview`/`lacuna.import_cards`, then the destructive group, each
   wired to its matching snapshot/restore pair. `ctx.grant` is threaded through every
   handler signature now (checked against a stub in tests) even though the real grant
   store lands in Task 7 — avoids re-touching every handler twice.

7. **Grant store + gating logic.** `electron/mcp/grants.ts` (`McpGrant`/scope-ordinal
   type, in-memory `Map`), plus pure grant-resolution logic and unit tests (ordinal scope
   comparison, unknown course = no grant), kept transport-independent so it is testable
   without Electron.

8. **[Arc 5.4] Shared reorder chevrons.** Replace the inline SVGs at `Settings.tsx:491`
   and `:508` with `ChevronDownIcon` (`src/components/ui/icons.tsx:290`, `rotate-180`
   convention per `SequenceItemRow.tsx:85`).

9. **IPC bridge (main ⇄ renderer) + Electron wiring.** `electron/mcp/server.ts` (SDK
   `Server`, tool registration, stdio transport), the correlation-id round-trip,
   renderer-not-ready timeout, `electron/preload.ts`'s `mcp` namespace,
   `src/mcp/bridge/renderer.ts`, `electron/tsconfig.mcp.json` + `package.json` script
   changes, and `lacuna.get_server_info`. No consent UI yet — grants default to a
   permissive stub so the transport can be smoke-tested end to end; Task 11 swaps the
   stub for the real blocking prompt. Verify the web build is unaffected.

10. **[Arc 5.5] Shared `Select` wrapper.** `src/components/ui/Select.tsx` following
    `Toggle.tsx`/`Button.tsx` conventions (typed props, `cn()`, token-backed classes),
    colocated test. Adopt at all seven sites: `SequenceEditor.tsx:495`,
    `course/PracticeNodeFields.tsx:52`, `cards/CardList.tsx:688,731`,
    `sequences/SequenceItemRow.tsx:128`, `analytics/CourseComparison.tsx:254,268`.

11. **Consent UI: `McpConsentPrompt` + `settings/McpSection.tsx`.** The blocking
    write/destructive consent prompt wired into the Task 9 bridge, replacing the
    permissive stub; the non-blocking read-grant toast; the new Settings section (added
    to `SETTINGS_SECTIONS`) with server status and per-course grant/revoke controls.
    Component tests with mocked `electronAPI.mcp`.

12. **[Arc 5.3] Split `Settings.tsx`.** With `McpSection.tsx` (Task 11) as one more
    precedent, extract the remaining inline sections of `Settings.tsx` (1,518 lines) into
    `src/pages/settings/`, preserving `SETTINGS_SECTIONS` and the IntersectionObserver
    scrollspy exactly. Deliberately after Task 11 — doing it earlier would make
    `Settings.tsx` a merge-conflict-prone moving target for the new section.

13. **Manual end-to-end smoke test + documentation.** Build the app, connect a real MCP
    client (`claude mcp add` pointing at the stdio command) and drive a scripted pass:
    list tools; read tool with no grant (expect implicit allow + toast); write tool with
    no grant (expect blocking prompt); grant; retry; destructive tool (expect prompt +
    undo toast); `diff_import_preview`/`import_cards` twice with the same payload (expect
    the second call to report everything as `toSkip`); cold-start case (tool call before
    window ready). Update `SPEC.md`/`CHANGES.md`; flip this section's header to
    "Status: delivered" per the Arc 1/Arc 4 precedent, noting deferrals (HTTP transport,
    companion process, durable identity).

## 2.10 Risks

- **Renderer-not-ready races** (medium): an agent's first tool call can arrive before the
  window has loaded or after it has been closed. Mitigated by the bounded timeout and
  explicit `internal` error; Task 13 must include a cold-start case.
- **Consent fatigue** (medium): aggressive agent retries on `forbidden` could train the
  user to reflexively approve. Mitigated by per-course scoping and process-scoped expiry,
  which keeps prompts infrequent enough to stay meaningful.
- **Bridge deadlock** (low): an unanswered request if the renderer handler throws outside
  the wrapper. Mitigated by wrapping every tool's execution centrally in
  `src/mcp/bridge/renderer.ts`, plus the main-process timeout as a backstop.
- **SDK version churn** (low): the MCP wire protocol has changed shape before. Pin to a
  specific version (recorded here once chosen in Task 3); no `^` ranges — same pin
  discipline as `ts-fsrs`.

## 2.11 Success criteria

1. Claude Code (or any MCP stdio client) connects to a locally built Lacuna and lists the
   full tool set.
2. An agent can read course/lesson/card/analytics data without any prompt, create and
   update content after a single one-time write grant per course, and only ever performs
   a destructive action after an explicit prompt plus an in-app undo path.
3. `diff_import_preview`/`import_cards` are safely re-runnable with no duplicate creation,
   verified by both a unit test and the manual smoke pass.
4. The web (Cloudflare) build is unaffected: no MCP SDK code reaches the browser bundle.
5. All five Arc 5 items shipped and verified in light and dark mode, with no regression to
   Settings' scrollspy behaviour.

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

# Arc 4 — Lesson/Practice Split, Checkpoint-Aware Horizon & Study Now

> **Status (July 2026): delivered.** Schema v12, the Lesson/Practice split, live per-card
> exam horizons, denser Practice cadence, the course-level Study now dispatcher, persistent
> Practice milestones, node progress treatment and local note annotations are implemented.
> The sections below record the shipped contract rather than a future design.

## 4.1 Motivation and approach

Lesson and Practice sessions share Learn Mode infrastructure but now have deliberately
different contracts. `Lesson.sessionFilter` is ignored by live lesson study and retained
only for legacy import compatibility; Practice no longer pulls every course card. The two
session types are:

- **Lesson** — first exposure only. New/unseen cards included in that specific lesson,
  including cards the teacher explicitly linked in through `LessonCardLink`, studied
  in a single Simple-mode pass: Yes/No, wrong cards requeue until every card has been
  answered correctly once, with no FSRS memory write. This is deliberately massed
  practice — grounded in the
  successive-relearning literature (Rawson & Dunlosky, 2022): a low-stakes massed first
  exposure followed by genuinely spaced retrieval later produces more durable retention
  than either a single massed session or spaced retrieval with no prior exposure at
  all. Lessons should be authored short (few cards per pass), per cognitive-load/
  chunking evidence — this is a "make each teaching pass smaller" instruction, not a
  "reduce the number of lesson units" one.
- **Practice** — spaced retrieval over everything reachable so far. Pool = cards from
  lessons already reached on the path that have been exposed in at least one lesson,
  filtered to cards not yet "secured" against whichever exam date actually applies to
  *that card* (§4.3). Requiring prior exposure prevents Practice from leaking unseen
  material. Ordering and session mechanics are the existing, unchanged Learn Mode engine
  (`selectNext`/`scoreCard`/cooldown) — no separate algorithm for Practice.
- **Study Now** — one course-level dispatcher button (not a per-lesson control) that
   reads the next reachable path node and routes to the lesson-study screen or an
   ordinary practice session accordingly. Auto curricular Practice milestones are
   one-time; once the curriculum has no unfinished node, Study now falls back to recurring
   end-of-course Practice.

## 4.2 "Taught" without a full FSRS write (Lesson / Simple mode)

**Problem addressed.** `lessonStatus` and `lessonTaught` formerly keyed entirely on
`card.state !== 0`, while Simple mode wrote no FSRS state. That made completion impossible
without corrupting the meaning of the FSRS record. A `Card.taughtAt` field was also
insufficient because a linked card can be taught separately in several lessons.

**Shipped fix.** `LessonCardExposure` is keyed by the unique `(lessonId, cardId)`
pair, with `taughtAt`. On a card's first correct answer in a lesson-scoped Simple-mode
session, upsert that pair without changing the card's FSRS state, memory fields or
review history. Primary and linked cards use the same representation. Lesson status
and the semi-linear unlock ratchet consider a lesson taught only when every card
currently included in it has an exposure record. Removing a link removes its exposure;
adding a new card or link makes the lesson incomplete until that pair is taught.

This is learner progress: it is included in full backups and restore-point payloads, but
excluded from course share codes, which distribute authored material rather than the
sender's study history. Repository helpers upsert, query and cascade-delete exposures.
The v12 migration creates exposure rows for existing reviewed cards in their primary
lesson only, preserving existing path completion without falsely claiming that a card
was taught through every display-only link. Existing linked cards therefore make their
linked lesson incomplete until they are actually introduced there.

Cardless lessons use a separate lesson-scoped `LessonCompletion` row, written by the
notes screen's **Continue** action. Completion is represented directly rather than by a
fictional exposure row.

## 4.3 Checkpoint-aware horizon (the "due" fix)

The existing, unit-tested `resolveCardExamDate` (`src/fsrs/examDate.ts`) is integrated
through the shared horizon and objective layers. Practice did not gain a second scheduler.

**Resolution order:**

1. **Lesson override** — if the card's primary lesson has an `examDate`, use it
   outright, even if it is in the past and even if a sooner checkpoint exists.
2. **Nearest applicable future checkpoint** — among the course's `CourseExamDate` rows
   that apply to the card (respecting `lessonIds` scoping and `excludedCardIds`), the
   soonest one still `>= now`. A passed checkpoint is ignored, so the next-nearest
   checkpoint (or the course default) naturally takes over.
3. **Course default** — the course's own `examDate`.

`cardSchedulingHorizon(card, schedulerConfig, examDateContext, now)` applies the same
"keep revising" fallback
`schedulingHorizon` already has — once the resolved date is in the past, roll forward
to `now + MAINTENANCE_HORIZON_DAYS` — to `resolveCardExamDate`'s result instead of to
`deck.examDate` directly.

This is a horizon-layer correction used by the shared objective engine. Practice does not
gain a special scheduler or a forked scoring path.

**Live per-card call sites:**

- `objective.ts`: `scoreCard` and `isObjectiveComplete`'s `expectedMarks` branch resolve
  the calling card's horizon rather than reusing one unit horizon.
- `progress.ts`: `masteryFraction` and `averagePredictedRetrievability` resolve horizons
  inside their per-card loops.
- `cram.ts`: `cramScore` — same per-card treatment for the weakest-first ranking. The
  48-hour exam-eve *window gate* (`examEveAvailable`) stays whole-course; that's a
  deliberate "is this unit in its final push" decision, not a per-card one.
- `ObjectiveContext` (`objective.ts`) carries an optional `examDateCtx?: ExamDateContext`,
  populated by `makeObjectiveContext` when building context for a Course unit (its
  lessons and `courseExamDates` loaded alongside it at session-start). Left `undefined`
  for legacy Deck-scoped/global sessions, which keep resolving against the single
  `deck.examDate` exactly as today — zero behaviour change there.

**Call sites that deliberately stay whole-unit** (a unit-level approximation is
correct here, not a shortcut): `session.ts`'s cross-course `urgency()` blending in the
global "Today" session, and `practice.ts`'s `shouldInsertPractice` near/far threshold
gate. Both could later converge on "nearest across the unit's own checkpoints" (i.e.
what `path.ts`'s `nearestExamDate` already computes) as a polish pass, but that isn't
required for this arc.

`eligibility.ts`'s `isDue`/`dueCards` are untouched — they keep their existing, narrower
job (the cosmetic "due today" badge count) and must not be conflated with the new
practice-pool test, which is "not secured against the card's own resolved horizon," a
different concept entirely.

## 4.4 Practice pool scope

The course-scoped load intersects course cards with lessons reached so far: lessons whose
`lessonStatus` is `completed` or `available` (not `locked`), using the same status
`path.ts` computes for path rendering.

Membership includes both primary cards and `LessonCardLink` rows, then deduplicates by
card id. A link can therefore make a card eligible earlier, but it does not change that
card's scheduling identity: per-card horizon resolution continues to use its primary
lesson, because the card has one shared FSRS memory state.

Combined with §4.3: a card is served by Practice only if (a) at least one lesson that
contains it has been reached, (b) it has a `LessonCardExposure` in at least one lesson, and
(c)
`rAtExam(card, cardSchedulingHorizon(card, examDateCtx, now), ...) < MASTERY_R` — i.e.
it is not yet secured against whichever exam date actually applies to it.

Practice nodes occur more often between deliberately shorter lesson passes through the
existing insertion system. Fixture-tested defaults are `practiceThresholdMinutesFar = 8`,
`practiceThresholdMinutesNear = 4`, and `practiceMaxGap = 2`. Small, medium, large and
near-exam fixtures cover the cadence. Existing courses retain saved values; the new defaults
apply to newly created courses and the global practice defaults UI.

## 4.5 Study Now dispatcher

One button on `CoursePath`, course-scoped only, reads `buildPath` for the next available
lesson or unfinished Practice milestone and routes:

- **Next node is a lesson** → a dedicated lesson-study screen: notes first — this
  extends the existing `LessonNotesScreen`/`LessonNotesIntro` first-study flow already
  in `LearnMode.tsx` rather than a parallel build — gaining text selection highlights
  with optional free-text annotations. Store these in a separate local
  `NoteAnnotation` table, anchored by source offsets plus the selected text so stale
  anchors can be detected after note edits. The first version restricts selection to one
  ordinary text block; code, maths, embeds and cross-block selections are rejected.
  Annotations are **device-local only** and excluded from exports, backups, restore points
  and share codes. After the notes, Simple mode serves the lesson's unseen primary and
  linked cards. A cardless lesson persists completion when **Continue** is pressed.
- **Next node is a practice node** → an ordinary practice session per §4.3/§4.4,
  unchanged engine. `PracticeMilestone` stores resumable progress and completed state,
  keyed to a stable node identity and scope version. The diamond perimeter shows the
  current secured proportion across the node's full scope; a distinct glow marks persisted
  milestone completion. Completion therefore does not disappear merely because retention
  later decays.
- **No unfinished curricular node** → recurring end-of-course Practice. This fallback is
  deliberately not persisted as a one-time milestone.
- **Dynamic analytics**: explicitly out of scope for this arc. No hooks added
  speculatively; revisit only once there's a concrete requirement.

## 4.6 Risks

- Per-card horizon resolution inside `masteryFraction`/`averagePredictedRetrievability`'s
  loops is one extra map lookup per card per call — fine at course scale, worth a quick
  benchmark if the course analytics page calls these over unusually large card sets.
- Exposure rows must remain lesson-scoped throughout repository queries; collapsing
  them to a card-level boolean would mark linked material taught in lessons where it
  has never been introduced.
- Note edits can invalidate offset-based annotation anchors. Preserve the selected
  source text for validation and surface an annotation as detached rather than
  silently highlighting the wrong text.
- `Lesson.examDate`'s "wins outright even if in the past" behaviour is live and tested.
  A stale forgotten lesson override can therefore pin a lesson's cards to maintenance
  scheduling after a passed date. A later Course Settings surface to audit or clear stale
  overrides remains sensible polish, not an Arc 4 omission.

## 4.7 Success criteria

1. A lesson session serves only unseen cards included in that lesson, including explicit
   links; completing a card writes only its lesson-scoped exposure and leaves FSRS state
   untouched. Cardless lessons complete explicitly through Continue.
2. A practice session's pool is exactly {previously exposed cards in reached lessons} ∩
   {not secured against their own resolved exam date}, ordered by the unchanged Learn Mode
   engine.
3. New courses receive a denser, fixture-tested practice cadence through the existing
   three insertion controls, with no parallel insertion mechanism.
4. `resolveCardExamDate`/`examDate.ts` is called by the live scheduler for the first
   time; existing deck-scoped/global-session tests keep passing unchanged.
5. Study Now on CoursePath correctly dispatches lesson vs practice per path state,
   reusing the existing notes-intro flow rather than a parallel screen; highlights and
   free-text annotations persist locally but appear in no portability format. Curricular
   Practice milestones resume, complete once and retain their completion glow, while the
   perimeter continues to show live full-scope readiness and end-of-course Practice recurs.
6. `tsc -b` clean, all tests pass, SPEC.md kept in sync with what's actually shipped.

---

# Arc 5 — UI Consistency Pass (outline)

Cheap, no dependency on the other arcs; may run any time, including interleaved between
them. Five items:

1. **Shared inline confirm.** `NoteRow.tsx` (~line 89, `confirmingDelete` prop) and the
   `Settings.tsx` backup-restore section (`confirmRestore` state, ~line 1150) each hand-roll
   an inline two-step confirm. Extract a shared `ConfirmInline` component and replace the
   six remaining `window.confirm()` call sites: `SequenceEditor.tsx:287`,
   `settings/LessonManagementSection.tsx:46`, `settings/ExamDatesSection.tsx:70`,
   `course/PracticeNodeEditor.tsx:74`, `settings/PracticeNodesSection.tsx:74`,
   `cards/LessonCardsSection.tsx:57`.
2. **Warning colour tokens.** Add `--warning`/`--warning-fg` HSL tokens to `src/index.css`
   alongside the existing `--accent`/`--positive`/`--negative` tokens, plus a Tailwind
   alias, replacing hardcoded `amber-*` literals across the nine files that use them:
   `CourseCard.tsx`, `StudySignals.tsx`, `UnifiedImportPanel.tsx`, `ScriptPasteImport.tsx`,
   `ProgressBar.tsx`, `CardEditor.tsx`, `HelpPage.tsx`, `LearnMode.tsx`, `SequenceEditor.tsx`.
3. **Split `Settings.tsx`.** At 1,518 lines it is the largest page in the app. Split into
   per-section files under `src/pages/settings/`, following the existing extraction
   precedent (`ExamDatesSection.tsx` etc.), keeping the single-page scrollspy UX unchanged.
4. **Shared reorder chevrons.** Settings' reorder controls hand-roll inline SVG chevrons
   (`src/pages/Settings.tsx:491` and `:508`) instead of the shared `ChevronDownIcon`
   (`src/components/ui/icons.tsx:290`). Replace with that icon or a small shared
   `ReorderControls` component.
5. **Shared `Select` wrapper.** A thin styled wrapper over native `<select>` using existing
   tokens, adopted at the five current native-select sites: `SequenceEditor.tsx:495`,
   `course/PracticeNodeFields.tsx:52`, `cards/CardList.tsx:688,731`,
   `sequences/SequenceItemRow.tsx:128`, `analytics/CourseComparison.tsx:254,268`.

---

# Arc 6 — Media Card Types: Audio and Image Occlusion (outline)

To be planned after Arc 2, since Arc 2's plugin-extension-point decision (custom card
types are the first predicted plugin surface) should inform whether these ship native or
via a plugin API. This arc builds the two highest-demand types natively regardless, and
the experience feeds back into that decision. Scope decided so far:

- **Audio.** A new card mechanic reusing the assets pipeline (`src/db/assets.ts`, currently
  image-only) with a player renderer. Decide at planning time between a new `CardType`
  and a Markdown audio embed — the choice affects the assets schema and the card
  renderer's dispatch.
- **Image occlusion.** Follow the Sequence precedent (§1): an authoring-time entity that
  generates read-only `Card`s anchored by stable region ids, so editing a region's shape or
  label regenerates that card's front while preserving its FSRS memory state. Needs a
  masking editor UI (draw/label regions over an uploaded image).
- Both types must respect the generated-card conventions already established for
  sequences: read-only in the card editor, badged, deletable only via their source entity.

---

# Arc 7 — Classroom Distribution: Versioned Courses and Re-import Merge (outline)

Sequenced after Arc 2 deliberately — this arc depends on Arc 2's idempotent, diff-friendly
repository tools (§Arc 2, "tool design requirement"). Scope decided so far:

- **Problem.** Share codes today are one-shot snapshots (Addendum 2 §E). A course revision
  forces students to either lose progress on re-import or never receive the update.
- Share codes carry a course lineage/version id.
- Re-importing an updated code diffs against the existing course: adds new material,
  flags edited or removed items, and preserves learner state — FSRS memory,
  `LessonCardExposure` (§4.2) — via stable-id anchoring, generalising the
  `SequenceItem.id` pattern (§1.2) to lessons, notes and cards generally.
- Explicitly not in scope: bidirectional sync between teacher and student copies (see
  Arc 8) — this is one-way redistribution of authored material only.

---

# Arc 8 — Multi-Device Sync (design decision first) (outline)

Un-parked as a direction, but the first deliverable of this arc is a design document
choosing among the options below, not code. The values fork must be settled before any
build begins:

1. **User-supplied sync target** — extend the existing File System Access folder mirror
   (`src/db/backups.ts`) from one-way backup to bidirectional sync.
2. **CRDT layer under Dexie** for content, with review logs merged as append-only event
   logs and FSRS state recomputed from the merged log.
3. **Self-hostable companion process**, architecturally adjacent to Arc 2's Electron-hosted
   MCP endpoint (a local companion a browser tab can connect out to).

No Lacuna-run cloud service in any option — that remains against the product's
local-only identity. Whichever option is chosen must preserve that.

---

# Arc 9 — Mobile Experience and Due-Card Reminders (outline)

Scope decided so far:

- **PWA polish.** `public/manifest.json` is thin today: one SVG icon (no maskable-safe
  raster set), no `screenshots` field, no install-prompt handling in the app. Add an icon
  set, screenshots, and capture the `beforeinstallprompt` event for an in-app install
  affordance.
- **Due-card reminders.** No notification mechanism exists anywhere in the codebase today
  (`Toast.tsx` and `UnifiedImportPanel.tsx`'s "Notification" hits are in-app toasts, not
  push/OS notifications). Scope local due-card reminder notifications where the platform
  permits (Notification API / service worker), no server component.
- **Capacitor fork.** Assess wrapping the PWA in Capacitor (real push notifications,
  app-store distribution) as an explicit fork against staying PWA+Electron only, since it
  adds a second native build pipeline to maintain.

---

# Cross-arc notes

- All arcs follow existing conventions: additive schema migrations with pre-migration
  snapshots, pure logic modules with tests before UI, British English, no emojis.
- Arc ordering is deliberate: Arc 0 gives one data model, Arc 1 stabilises the repository
  API that Arc 2 exposes, Arc 3 is self-contained. Arc 2 (MCP) is the next detailed build.
  Arc 5 (UI consistency pass) is cheap and carries no dependency on the others — it may
  interleave at any point, including between other arcs. Arc 7 depends on Arc 2's
  repository-tool work and is sequenced after it deliberately. Arc 8 (sync) is un-parked
  as a design question, not yet an implementation commitment; Arc 9 and Arc 6 are
  independent of each other and of Arc 8.
- Each arc gets its own detailed plan (or addendum here) before implementation begins;
  outline sections above are scope agreements, not specifications.

*End of plan.*
