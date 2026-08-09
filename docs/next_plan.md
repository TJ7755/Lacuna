# Lacuna — Post-Course-Architecture Plan

## Document purpose

Successor to `new_features_list.md` (the Course Architecture Plan). Covers the close-out of
that plan (Phase 8 and its recorded deferrals) and the next feature arcs, in order:

1. **Arc 0 — Course architecture close-out** (detailed)
2. **Arc 1 — Sequence learning** (detailed; ordered lists first, lines mode as v2)
3. **Arc 2 — MCP server / agent surface** (outline; the next detailed build)
4. **Arc 3 — Assessment-aware revision planning and Cram** (detailed; the document owed
   by Addendum 2 §G/§M)
5. **Arc 4 — Lesson/Practice split, checkpoint-aware horizon & Study Now** (detailed)
6. **Arc 5 — UI consistency pass** (outline; cheap, may interleave at any point)
7. **Arc 6 — Media card types: audio and image occlusion** (outline)
8. **Arc 7 — Classroom distribution: versioned courses and re-import merge** (outline;
   depends on Arc 2)
9. **Arc 8 — Multi-device sync** (outline; design decision first)
10. **Arc 9 — Mobile experience and due-card reminders** (outline)
11. **Arc 10 — UI de-clutter and navigation restructure** (detailed; independent of
    Arcs 6–9, may run before them)
12. **Arc 11 — Item-type generalisation and authored mark schemes** (numeric/working
    delivery complete bar success criterion 3, which the first free-tier trial did not
    meet; deliberate post-arc deferrals recorded)
13. **Arc 12 — Progress receipts and encrypted relay** (detailed outline; depends on
    Arc 11 for mark-bearing receipts, but a retrievability-only first slice depends on
    nothing)
14. **Arc 13 — Codebase consolidation and release verification** (final cleanup arc;
    follows the feature arcs and finishes with the complete browser checklist)

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

Resolved in the release close-out: the seeded Welcome course now stores its bundled SVGs
as `Uint8Array`, matching the rest of the asset layer. Startup performs a one-time,
idempotent repair of missing or legacy Blob-backed seeded assets, with fresh-seed,
round-trip rendering and existing-installation regression coverage.

Resolved in the release close-out: answering in non-Simple practice keeps the session chrome
mounted, moves between card surfaces with a motion-speed-aware hand-off, and interpolates the
objective track and ring from their prior values. The regression test advances through both
No and Yes while asserting that the same header and accumulated session state remain mounted.

---

# Arc 0 — Course Architecture Close-out

> **Status (July 2026): complete.** All Phase 8 items, deferred debts, the add-lesson
> UI gap and the manual end-to-end pass are complete. Schema removal of the internal
> `decks`/`folders` tables remains explicitly out of scope (§0.3).

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
6. **End-to-end pass — complete (July 2026).** Manually walked through the full student
   journey (dashboard → path → lesson → notes → lesson learn → practice → checkpoint),
   including import of a v1 share code and a pre-v9 backup.

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

> **Status (July 2026): delivered.** All 13 tasks are implemented and the real-client
> smoke pass (Task 13) has completed: tool listing, implicit read grants, blocking
> write/destructive consent prompts, destructive-with-undo, idempotent
> `diff_import_preview`/`import_cards`, and the cold-start renderer-not-ready case all
> behaved as designed. Deferred: Streamable HTTP transport, the `npx lacuna-mcp`
> companion process, durable multi-agent identity, plugin extension points, and
> study-session hooks (see §2.1 and the Arc 2 outline above). Remaining human item: visual
> confirmation of the read-grant toast and destructive-undo toast styling in light and dark
> mode. The smoke pass covered a client cold-starting Lacuna; it did not cover attaching to
> an application the user had already opened. The single-instance lock makes that second
> launch exit and closes the new client's stdio pipe, so §2.12 now treats the companion as
> required local infrastructure rather than merely a web-app extension.

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
  (needs `mainWindow.webContents` for the bridge). The existing single-instance lock limits
  this implementation to the first MCP client that cold-starts Lacuna: it prevents duplicate
  servers, but also prevents a later client from attaching to an already-running app. This
  is accepted only for the delivered Arc 2 slice and is replaced by §2.12. No change to
  `installSecurityHeaders` — the MCP server is Node-side and never touches the renderer's
  `connect-src`.
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

7. **Grant store + gating logic.** `src/mcp/grants.ts` (`McpGrant`/scope-ordinal
   type, in-memory `Map`), plus pure grant-resolution logic and unit tests (ordinal scope
   comparison, unknown course = no grant), kept transport-independent so it is testable
   without Electron. (Lives under `src/mcp/`, not `electron/mcp/`, since the resolution
   logic is transport-independent and shared with the renderer-side bridge.)

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

10. **[Arc 5.5] Shared `Select` wrapper — implemented (July 2026).**
    `src/components/ui/Select.tsx` following
    `Toggle.tsx`/`Button.tsx` conventions (typed props, `cn()`, token-backed classes),
    colocated test. Adopt at all five sites: `SequenceEditor.tsx:495`,
    `course/PracticeNodeFields.tsx:52`, `cards/CardList.tsx:688,731`,
    `sequences/SequenceItemRow.tsx:128`, `analytics/CourseComparison.tsx:254,268`.

11. **Consent UI: `McpConsentPrompt` + `settings/McpSection.tsx` — implemented (July
    2026).** The blocking
    write/destructive consent prompt wired into the Task 9 bridge, replacing the
    permissive stub; the non-blocking read-grant toast; the new Settings section (added
    to `SETTINGS_SECTIONS`) with server status and per-course grant/revoke controls.
    Component tests with mocked `electronAPI.mcp`.

12. **[Arc 5.3] Split `Settings.tsx` — implemented (July 2026).** With `McpSection.tsx` (Task 11) as one more
    precedent, extract the remaining inline sections of `Settings.tsx` (1,518 lines) into
    `src/pages/settings/`, preserving `SETTINGS_SECTIONS` and the IntersectionObserver
    scrollspy exactly. Deliberately after Task 11 — doing it earlier would make
    `Settings.tsx` a merge-conflict-prone moving target for the new section.

13. **Manual end-to-end smoke test + documentation — implemented (July 2026).** Built the
    app, connected a real MCP client and drove the scripted pass: 35 tools listed; read
    tool implicitly allowed with no prompt; write tool blocked on consent then succeeded
    after approval; destructive `delete_course` prompted then executed with an undo path;
    `diff_import_preview`/`import_cards` run twice with the second run reporting
    everything as `toSkip` (`createdCount: 0`, `skippedCount: 1`); cold-start tool call
    returned a clean curated `internal` error ("Lacuna did not resolve the tool scope in
    time") rather than a crash. `SPEC.md`/`CHANGES.md` updated; this section's header
    flipped to "Status: delivered" per the Arc 1/Arc 4 precedent, noting deferrals (HTTP
    transport, companion process, durable identity, plugin extension points,
    study-session hooks). Remaining human item: visual confirmation of the read-grant and
    destructive-undo toast styling.

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

## 2.12 Follow-up — attachable local MCP companion

**Problem.** A stdio MCP host owns the server process it launches. Lacuna also permits only
one Electron process, so a client configured with the Lacuna executable works only when it
is the process that cold-starts the application. If Lacuna is already open, or a second MCP
host tries to connect, the new process exits under the single-instance lock and its stdio
connection disappears. The current implementation therefore exposes the right tools through
the wrong lifecycle boundary.

**Required local outcome.** A user opens Lacuna normally and one or more local MCP hosts can
connect or reconnect without relaunching it. Add a small `lacuna-mcp` companion that owns the
client-facing transport and relays requests to the single running Electron application:

1. Provide a stdio entry point for clients that launch one server process per connection,
   plus loopback Streamable HTTP only if it materially improves multi-client discovery.
2. Connect the companion to Electron over authenticated, user-local IPC (Unix-domain socket
   on macOS/Linux and named pipe on Windows), not an unauthenticated listening port.
3. Keep tool definitions, validation, course-scope resolution, consent and IndexedDB access
   in their existing shared/renderer layers; the companion is a transport relay, not a
   second repository implementation.
4. Make app-not-running, renderer-not-ready, stale-session and reconnect states explicit MCP
   errors. Never silently launch a second data-owning application instance.
5. Identify each live client connection so grants and consent notices can name their source;
   retain process-scoped expiry unless a separate durable-identity design is approved.
6. Cover attachment to an already-running app, simultaneous Codex/Claude-style clients,
   client restart, application restart and rejected consent in automated integration tests.
7. Update installation UX and Settings with copyable client configurations and connection
   status; the user should not have to discover executable internals by archaeology.

**Remote surfaces are a separate decision.** ChatGPT/API and other cloud-only MCP hosts need
an authenticated, network-reachable Streamable HTTP endpoint. Serving that through an
outbound tunnel or relay would move selected Lacuna data beyond the local machine and changes
the product's local-only privacy promise. Do not smuggle it into the local companion. Plan it
only after an explicit product decision covering authentication, per-user routing, consent,
hosting and data retention.

## 2.13 Follow-up — programmatic operation and release scenarios

**Goal.** Lacuna should be operable and verifiable through its real domain APIs without forcing an
agent or release tester to reproduce every data mutation through the GUI. The existing MCP tool
contract is the foundation: it already reuses repository functions, validators, course scoping and
consent. Do not add a parallel REST API or a second data-access implementation.

The programmatic surface and GUI automation have different jobs:

1. **MCP builds and inspects scenarios.** It creates disposable courses, lessons, notes, cards,
   sequences, occlusions and assessments, then reads the resulting content, due pools, weak cards,
   statistics and diagnostics.
2. **A test-only scenario runner performs human-only state transitions.** Review recording, undo,
   first-run seeding, backup restoration and other deliberately non-MCP operations may be exposed to
   automated integration tests, but never added to the normal agent tool surface merely for test
   convenience. It must call the same application services as the UI rather than writing IndexedDB
   records directly.
3. **GUI automation verifies interface behaviour.** Route transitions, focus trapping, keyboard and
   touch input, drag-and-drop, responsive layout, themes, reduced motion and visual regressions still
   require the web or Electron renderer. MCP success is not evidence that a control is usable.
4. **Human review is reserved for judgement.** Typography, hierarchy, animation quality and platform
   feel remain a short visual sign-off rather than hundreds of repetitive data-entry steps.

The attachable `lacuna-mcp` companion in §2.12 must land first so scenario setup can connect to a
normally running application. After that, provide a release-scenario command that:

1. creates an isolated profile or disposable database;
2. seeds a canonical course containing every supported content and assessment type;
3. runs named state transitions through MCP and the test-only runner;
4. verifies persisted state and invariants through MCP reads;
5. opens exact renderer routes for screenshot and interaction assertions; and
6. destroys only the isolated profile after producing a machine-readable report and evidence index.

Keep destructive targeting explicit and recoverable. The runner must reject the ordinary user
profile, unresolved paths, broad deletion targets and schema-version mismatches. It must never expose
raw FSRS field writes or let an agent record recall on a user's behalf.

**Release outcome.** Most of `WEBSITE_TEST_CHECKLIST.md` becomes repeatable integration coverage.
The manual pass remains authoritative only for behaviour that is genuinely visual, physical or
platform-dependent. Each checklist item must state whether its evidence came from a programmatic
scenario, GUI automation or human inspection; `not run` must never be treated as `pass`.

## 2.14 Follow-up — polished MCP product surface

**Product outcome.** An MCP-connected assistant should be able to perform roughly 70–80% of
Lacuna's non-visual user operations through the real domain layer. It should build and maintain
courses, organise material, prepare assessments, inspect learning state, manage imports and
backups, and conduct carefully constrained study sessions. Perception, subjective judgement,
physical interaction and authentic recall remain human- or GUI-owned.

This is an expansion of the transport-independent contract under `src/mcp/`, not permission to add
a parallel REST API, a second repository implementation or generic GUI controls. Expose domain
verbs such as `archive_course`; never reproduce brittle browser automation as
`click_course_menu`/`click_archive`.

### 2.14.1 Current polish audit

The existing 45-tool surface has sound repository reuse, validation, course-scope resolution and
consent, but it is not yet a finished integration:

1. The stdio lifecycle requires the MCP host to cold-start Electron and cannot reliably attach to
   an already-running Lacuna process. §2.12's companion is therefore a prerequisite.
2. Tool results are JSON-serialised into text instead of being returned as MCP
   `structuredContent` backed by declared output schemas.
3. Tools do not expose complete standard annotations for read-only, destructive and idempotent
   behaviour.
4. Long-running imports, backups and optimisation have no progress reporting or cancellation.
5. Consent is shown out-of-band in Lacuna while the client appears to wait without useful status.
6. Every call is attributed to the generic `stdio-mcp-client`; Settings and consent cannot identify
   the actual connected client.
7. Large result sets have no consistent cursor pagination.
8. Mutating tools do not consistently accept idempotency keys or optimistic revision tokens.
9. The server exposes tools only: it does not use MCP resources for read-heavy context or
   user-controlled prompts for named workflows.
10. Resource subscriptions and change notifications do not exist, so clients must poll and can work
    from stale state.
11. The smoke scripts are machine-specific: `scripts/mcp-smoke.mjs` hard-codes the repository path,
    and `scripts/mcp-smoke-click-allow.mjs` defaults to two approvals although the current flow needs
    three (global write, course write and destructive).
12. Documentation still records the earlier 35-tool smoke result in places although the live server
    now lists 45 tools.

### 2.14.2 Protocol and connection foundation

Complete these before broadening the action inventory:

1. Land the attachable `lacuna-mcp` companion from §2.12 with authenticated user-local IPC,
   reconnect support and explicit app-not-running/renderer-not-ready/stale-session errors.
2. Identify every connection with a client name, version and ephemeral connection id. Include that
   identity in consent prompts, notices, Settings and diagnostics.
3. Return both concise human-readable text and typed `structuredContent`; declare an output schema
   for every tool and validate it before sending a result.
4. Add standard tool annotations wherever the pinned SDK and negotiated protocol version support
   them. Lacuna's own `requiredScope` remains authoritative for enforcement.
5. Standardise machine-readable errors with stable kinds, entity ids and retryability metadata while
   retaining concise user-facing messages. Never leak stack traces or repository snapshots.
6. Add opaque cursor pagination to card, note, search, review-log and task-style results. Never make a
   client load an entire large course merely to find the next page.
7. Accept an optional idempotency key on create/import/publish/backup operations. Store only the
   bounded data required to replay the result safely, scoped to the live connection or explicit
   operation lifetime.
8. Include entity revision tokens on reads and accept `ifRevision` on consequential updates. Return
   a conflict with current revision metadata rather than silently overwriting newer user work.
9. Emit progress notifications for long operations and honour cancellation at safe transaction
   boundaries. Cancellation must never leave a partial import, restore or optimisation applied.
10. Use negotiated form elicitation for simple, non-sensitive missing inputs where the client
    supports it. Keep Lacuna's in-app consent for privileged actions; client elicitation is not a
    substitute for the trusted permission boundary.
11. Make capability support explicit in `lacuna.get_server_info`: protocol version, tool-surface
    version, resources/prompts support, progress/cancellation support and relevant feature flags.
12. Replace the hard-coded smoke setup with portable path resolution and a fresh disposable profile.
    The smoke pass must derive its expected consent count from the scenario rather than duplicating
    it as a magic number.

Relevant protocol features are documented by MCP at:

- <https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation>
- <https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress>
- <https://modelcontextprotocol.io/specification/2025-11-25/schema>

Keep the pinned SDK/protocol compatibility matrix in the repository. Do not assume every client
implements every optional capability merely because the latest specification defines it.

### 2.14.3 Resources and user-controlled prompts

Use resources for stable or subscribable context rather than inflating the tool list with dozens of
read-only variants. Initial resource templates:

```text
lacuna://courses/{courseId}/outline
lacuna://courses/{courseId}/stats
lacuna://courses/{courseId}/due
lacuna://courses/{courseId}/assessments
lacuna://lessons/{lessonId}/notes
lacuna://cards/{cardId}
lacuna://schemas/working-mark-scheme
lacuna://schemas/import-formats
```

Resource reads use the same course-scoped implicit-read grants as tools. Subscriptions may emit
`resources/updated` after committed repository changes; coalesce bursts and never notify before a
transaction commits. Binary assets remain opt-in resource links or explicitly approved downloads,
not automatic inline disclosure.

Add a small set of user-invoked prompts for repeatable workflows:

- **Build a course from notes** — inspect source material, propose a course outline, then stage
  content before any write.
- **Audit this course** — report missing coverage, duplicate cards, malformed material and weak
  areas without changing data.
- **Prepare for an assessment** — inspect exact coverage and produce or update a revision plan after
  approval.
- **Revise weak topics** — explain the eligible weak-card set and start a constrained study session
  only when requested.
- **Review an incoming course update** — run the lineage diff and guide explicit conflict choices.

Prompts orchestrate resources and tools; they do not receive hidden permissions and do not contain a
second implementation of domain rules.

### 2.14.4 Expanded action inventory

#### Courses, settings and path authoring

- Archive, restore, duplicate and reorder courses.
- Read and update the complete supported course settings contract: objective, scheduling limits,
  retention/fuzz/maximum interval/steps, leech policy, unlock mode, auto-practice thresholds,
  default lesson view, exam board and specification.
- Reorder lessons and move a lesson to an explicit stable path position.
- Create, update, reposition and delete manual practice nodes, including filters and randomisation.
- Preview unlock/path consequences before applying a structural change.
- Return affected entity ids and a bounded undo action for reversible mutations.

Do not expose one tool per scalar setting. Use cohesive read/update schemas with optional fields,
field-level validation errors and optimistic revision checks.

#### Notes and lesson membership

- Reorder, move, duplicate and delete notes.
- Link and unlink an existing card from a lesson without changing its scheduling identity.
- Move a card's primary lesson using repository-owned invariants.
- Preview Markdown validation and resolved local asset references without requiring a save.

Device-local note annotations remain excluded from normal MCP reads and writes. Their privacy model
would be destroyed if an assistant could silently enumerate them.

#### Cards and batch authoring

- Bulk tag, move, duplicate, reverse, link, unlink, suspend and flag cards.
- Add an explicit reverse-card operation that reports the created relationship and refuses accidental
  repeated reversal through an idempotency key.
- Validate a proposed classic, cloze, numeric or working item without saving it.
- Create a batch-staging session; add, edit, revalidate, reject and accept individual items; accept
  all clean items; report duplicates and isolated validation failures structurally.
- Expose revision context for a rejected machine-marked item without sending content to any external
  model itself.

Generated sequence/occlusion cards remain read-only through card tools. Mutate them through their
owning generator so stable identities and scheduling state survive regeneration.

#### Sequences and occlusions

- Expose sequence presets, mode changes, speaker/chunk metadata, label-card options and regeneration
  previews.
- Return generated-card diffs before sequence updates: create, preserve, update and remove counts
  with stable ids.
- Permit asset ingestion only from an explicitly approved local file or client-provided content
  block, with size/type validation, hashing and deduplication.
- Preview occlusion regeneration and region validation before applying it.
- Preserve the existing no-arbitrary-filesystem-access rule: roots must be explicit and file targets
  must resolve inside the approved selection.

#### Assessments and revision plans

- Reorder assessments and expose complete prefix/custom coverage and exclusions.
- Create, update, replan, archive and delete revision plans.
- Start and close individual revision windows; return covered, improved, parked and not-reached
  summaries.
- Explain material replanning changes and preserve completed history.
- Expose the ordinary-Practice fallback reason when the short-term model is unavailable.

#### Search and analytics

- Search courses, lessons, notes and cards using the application's real text, tag, due/new/leech,
  flagged and suspended filters.
- Return typed result locations that other tools can consume without scraping UI routes.
- Expose forecasts, exam-day prediction, calibration accuracy, review volume, study time, retention
  by age, leech counts, machine-marked criteria and course comparisons as structured reads.
- Keep chart rendering out of MCP; the client receives data and labels, not screenshots pretending to
  be accessible analytics.

#### Import, export, sharing and backups

- Detect and preview CSV, TSV, Anki text, Markdown, JSON, share-code, full-backup and APKG input.
- Expose field mapping, delimiter/header decisions, skipped records and unsupported material before
  acceptance.
- Keep import acceptance atomic and idempotent.
- Export course/share/full-backup and limited formats with explicit completeness metadata and warnings
  about omitted assets or scheduling history.
- Publish course revisions, inspect lineage, preview merges and apply explicit conflict choices.
- Create, list, inspect and delete restore points.
- Restore backups only after a preflight summary and fresh destructive confirmation; create a
  pre-restore snapshot first.

Large generated artefacts should be returned as resource links or explicitly saved files, not dumped
as enormous base64 strings inside ordinary tool results.

#### Maintenance and optimisation

- Report storage quota, persistent-storage state, asset references, orphan candidates and database
  integrity diagnostics.
- Run safe asset garbage collection with a preview and recoverable transaction where practical.
- Run scheduling optimisation as a cancellable long operation with progress, eligibility reasons,
  held-out validation metrics and an explicit apply step.
- Never apply new weights merely because training completed; require the existing validated-
  improvement gate.

### 2.14.5 Safe study-session contract

Do not expose the repository's raw `recordReview`/`undoReview` functions. A general-purpose agent
must not claim that the user remembered something and poison their FSRS history. Instead, add a
session-scoped façade only after the underlying study engine is extracted into shared application
services:

```text
lacuna.start_study_session
lacuna.get_current_prompt
lacuna.reveal_answer
lacuna.submit_explicit_user_response
lacuna.undo_last_response
lacuna.get_session_report
lacuna.end_study_session
```

Rules:

1. `start_study_session` returns an opaque, short-lived token bound to one client, course, mode and
   eligibility snapshot. It does not return the whole queue for client-side manipulation.
2. Lacuna owns timing. The client cannot supply response times or arbitrary grades.
3. Classic/cloze self-grading records only an explicit user assertion relayed by the client. The
   client must not infer recall from its own answer or explanation.
4. Numeric and working answers may be marked by Lacuna's deterministic checker. The result includes
   marks, criteria and dispute actions; the client cannot silently override the verdict.
5. Manual four-grade mode accepts only a grade the user explicitly selected. Silent grading derives
   the grade from the user's Yes/No response and Lacuna-owned timing.
6. The first history-writing response in a session requires explicit session-level consent unless
   the user started the session from Lacuna and delegated that exact live session.
7. Undo calls the real session engine and restores scheduling, progress, calibration, cooldown and
   review history atomically.
8. Session expiry, application restart, stale token, changed card and concurrent grading are explicit
   conflicts. Never guess how to merge them.
9. The assistant may explain feedback and ask the user for an answer; it may not answer and grade the
   card on the user's behalf.
10. Focus, swipe, keyboard, Pomodoro and animation behaviour remain GUI concerns even when the domain
    session is MCP-driven.

### 2.14.6 Permission tiers

Retain ordinal, course-scoped grants but refine their presentation and operation boundaries:

- **Read** — implicit per course with a visible notice; covers resources and read-only tools.
- **Write** — explicit consent; covers ordinary reversible content and settings changes.
- **Destructive** — fresh or appropriately scoped consent plus a preflight summary; covers permanent
  deletion, restore/replace and broad bulk mutation.
- **Study history** — separate short-lived session consent; never implied by ordinary write access.
- **Local file access** — explicit user-selected roots/files for the duration required; never a broad
  home-directory grant.

The server, not the client or tool description, enforces the tier. Grants expire with the appropriate
connection/session lifetime and remain revocable in Settings. Persistent blanket grants are out of
scope until there is a separately reviewed identity and threat model.

### 2.14.7 Permanent exclusions

Do not expose:

- arbitrary IndexedDB queries, table access or record patches;
- raw per-card FSRS stability, difficulty or review-log writes;
- fabricated review history or automatic subjective self-grading;
- generic click/type/navigate/window-control tools;
- unrestricted filesystem paths or implicit folder crawling;
- silent backup replacement, course publishing or merge conflict resolution;
- repository undo snapshots or other internal recovery payloads;
- hidden durable credentials or persistent blanket permissions; or
- a network-reachable remote MCP endpoint without the explicit privacy, authentication, routing,
  hosting and retention decision already required by §2.12.

### 2.14.8 Delivery sequence

1. **Connection and harness polish** — companion, client identity, portable smoke profile, current
   tool-count assertions and attach/reconnect integration tests.
2. **Protocol correctness** — structured outputs, output schemas, annotations, stable errors,
   pagination, idempotency, optimistic revisions, progress and cancellation.
3. **Resources and prompts** — course/lesson/card/stat resources, subscriptions and the five named
   user workflows.
4. **Low-risk action parity** — search, analytics reads, course settings, reordering, note/card
   membership and practice-node CRUD.
5. **Authoring workflows** — batch staging, sequence/occlusion previews and constrained asset
   ingestion.
6. **Assessments and revision plans** — plan/window lifecycle and summaries.
7. **Portability and sharing** — unified imports, exports, backups, restore points, publishing and
   lineage review.
8. **Maintenance and optimisation** — diagnostics, storage maintenance and cancellable training/apply
   flow.
9. **Safe study sessions** — only after shared session services, session consent and atomic undo are
   proven independently of MCP.
10. **Release-scenario integration** — use §2.13's isolated runner to prove the combined surface and
    reduce the manual checklist without weakening its GUI/human boundaries.

Each step ships with handler tests against the transport-independent contract, bridge/permission
tests, and at least one real-client integration scenario through the companion. Do not batch a large
tool inventory behind untested consent plumbing.

### 2.14.9 Acceptance criteria

1. A normally launched Lacuna accepts multiple reconnecting local MCP clients without losing the
   single renderer-owned database or confusing their grants.
2. Every tool has validated input/output schemas, accurate annotations, stable error semantics and
   current documentation.
3. Re-running any operation documented as idempotent produces no duplicate mutation.
4. Conflicting writes fail with actionable revision metadata instead of overwriting newer work.
5. Long operations report monotonic progress, support safe cancellation and leave no partial state.
6. Resources respect course grants and notify subscribed clients only after committed changes.
7. Destructive, restore, publish and study-history actions cannot complete without their required
   trusted consent path.
8. An agent can complete the supported non-visual workflows without scraping UI text or inventing
   internal ids/routes.
9. The web build remains free of the Electron MCP SDK and local companion transport.
10. The expanded surface achieves approximately 70–80% non-visual operation coverage without adding
    raw database access, fabricated recall or generic GUI automation.

### 2.14.10 MCP interaction and presentation polish notes

These are product requirements, not decorative cleanup to postpone until after the tool inventory.
The current server can complete a call correctly while still leaving the user unsure what connected,
what is waiting, what changed or how to recover.

#### Connection and setup

1. Settings must show **Starting**, **Running**, **Stopped**, **Unavailable** and **Error** as distinct
   states. The current `null` status renders as `Stopped`, `0 tools` and `Surface v0` while the first
   request is loading, which reports a false failure.
2. Show the actual connected clients, not merely server status: name, version, connection time, last
   activity, current operation and whether reconnect is healthy.
3. Provide copyable, client-specific configuration for supported local MCP hosts. Users should not
   have to find an executable path or construct stdio arguments manually.
4. Add a connection test that reports each stage separately: companion found, Electron reached,
   renderer ready, database open, tool contract compatible.
5. Show actionable recovery for stale companion, incompatible tool-surface version and renderer-not-
   ready failures. `Could not read MCP server status` is accurate but useless.
6. Do not display internal protocol trivia as the primary status. `Surface v2` belongs in expandable
   diagnostics; connection health and the connected client's identity matter more.
7. Keep a compact copyable diagnostics block containing app version, companion version, negotiated
   protocol version, tool-surface version, tool count and last connection error.

#### Grants and terminology

1. Rename or explain the `__global__` row. **All Lacuna data** currently sounds like a blanket grant
   over every course, but the pseudo-scope gates no-course-id operations such as listing/creating
   courses and whole-database diagnostics; course tools still use course-specific grants. The UI must
   describe what the grant actually authorises.
2. Explain the three ordinary tiers in plain language beside the controls:
   **Read** inspects data, **Write** creates or changes content, and **Destructive** permits deletion
   and broad mutation. Do not rely on users knowing Lacuna's ordinal grant model.
3. Display which client owns each live grant, when it was granted and when it expires. A bare
   `write access` label gives too little information for a security control.
4. Granting destructive access directly from Settings needs an inline confirmation describing its
   breadth. A small ghost button should not silently turn one accidental click into course-wide
   deletion authority for the rest of the session.
5. Downgrade and revoke should use consistent verbs and immediately announce the resulting scope.
   Generic failure toasts must include the affected client/course and a retry action where safe.
6. Group or filter course grants when there are many courses. One unpaginated row per course will
   turn Settings into a wall of repetitive controls.
7. Separate short-lived **Study history** and **Local file** permissions visually from the ordinary
   read/write/destructive ladder. They are different risks, not two more ordinal levels.

#### Consent requests

1. Render consent as a semantic modal/sheet with an accessible name, focus trap, Escape behaviour and
   focus restoration. The current fixed `div` has no dialog semantics and does not itself manage
   focus.
2. Name the requesting client. `An MCP client` is insufficient once more than one host can connect.
3. Translate internal names such as `lacuna.delete_course` into a concise action summary while
   retaining the exact tool name under optional technical details.
4. Show the exact target and expected effect: course, entity names, item count, whether history or
   assets are affected, and whether Undo is available. `This can remove or bulk-change data` is too
   generic for informed consent.
5. For destructive actions, show a server-generated preflight summary based on the live database.
   Never trust the client to describe its own impact.
6. Distinguish **Deny**, **Not now**, **Timed out**, **Target changed** and **Client disconnected** in
   the result. Returning the same missing-grant error for every branch makes recovery guesswork.
7. The current ten-second bridge timeout is too short for a human consent decision. Scope resolution
   may remain tightly bounded, but an on-screen permission request needs a separate human-scale
   lifetime, visible countdown/status and cancellation when the client disconnects.
8. Coalesced requests should state that matching calls are waiting behind the same decision. Consent
   must never approve a broader target or scope merely because several calls arrived together.
9. When prompts queue, show position/count and refresh the course label synchronously for the next
   request. Do not briefly display the previous request's label while an asynchronous lookup settles.
10. If the application is backgrounded, use a restrained native attention signal without stealing
    focus. Repeated consent requests must be rate-limited so a broken client cannot harass the user.

#### In-progress and completed actions

1. The client and Lacuna should show the same operation id and status: waiting for consent, running,
   committing, completed, failed, cancelled or undone.
2. Long operations need meaningful progress text and monotonic progress values. `Importing 318 of
   1,204 cards` is useful; an indeterminate spinner labelled `Working` is not.
3. Cancellation should say whether nothing changed, a transaction rolled back or a safe partial
   artefact remains. Never imply rollback without verifying it.
4. Completion messages must use user language. `MCP action lacuna.delete_course completed` exposes an
   implementation name; prefer `Deleted “Biology mock course”` with `Undo` and optional details.
5. Undo notices must state their expiry/lifetime and affected records. If Undo cannot be guaranteed
   after another conflicting mutation, disable it with an explanation rather than failing later.
6. Collapse repeated read-grant notices from the same client/course. The current toast identifies the
   course but not the client or initiating operation and can become notification noise.
7. Maintain a session-scoped activity list containing client, operation, target, result, time and undo
   status. It is an audit aid, not a permanent telemetry log, and clears when the MCP session ends.
8. Provide `Copy details` for failures using sanitised structured diagnostics. Do not make users
   transcribe a fleeting toast or expose private course content in logs by default.

#### Tool and response presentation

1. Tools should return a one-line user summary plus structured data. Raw JSON strings are poor for
   clients, inaccessible for people and impossible to validate against an output contract.
2. Use stable display labels for entities alongside ids. Agents need ids for follow-up calls; users
   should not be shown a UUID where a course or lesson name is available.
3. Validation errors need field paths and local messages. A single serialised Zod error blob is not a
   finished authoring experience.
4. Bulk results must separate succeeded, skipped, conflicted and failed items and preserve input order
   or explicit correlation ids.
5. Every preview/apply pair should share an opaque revision token so the user can see when the target
   changed between inspection and execution.
6. Tool descriptions should state prerequisites and consequences, not marketing copy. Resources and
   prompts should carry the explanatory workflow material instead of bloating every tool description.
7. Avoid tool-list sprawl. Prefer resources for read-heavy context, cohesive update schemas for
   related settings and prompts for orchestration. A hundred microscopic tools would technically
   expand coverage while making discovery worse.
8. Preserve British English in all server descriptions, consent copy, errors and generated summaries.

#### Visual quality and responsive behaviour

1. The MCP Settings section must be tested with zero, one, dozens and hundreds of courses. Controls
   must remain scannable without wrapping into ambiguous button soup.
2. Current access should be visually dominant; available upgrades/downgrades are secondary. A row of
   equally weighted `Read`, `Write`, `Destructive` and `Revoke` buttons obscures the current state.
3. Destructive affordances use the same warning vocabulary, colour tokens and confirmation patterns
   as the rest of Lacuna. MCP must not look like a bolted-on administrator console.
4. Consent and activity surfaces must work at narrow widths, 200% zoom, light/dark themes and reduced
   motion, with 44 px touch targets and no obscured action buttons.
5. Status cannot rely on red/green text alone. Include an icon or textual state and expose changes to
   assistive technology without moving focus.
6. Tool names, ids, error details and configuration commands may be long. Wrap or scroll technical
   values without forcing horizontal overflow across the whole Settings page.
7. Empty states should explain how to connect a client or why no grants exist. Do not show a blank
   list beneath a bare `Stopped` label.

#### Polish acceptance checks

1. A new user can connect a supported client from Settings without reading repository documentation.
2. The user can identify every connected client and every permission it currently holds.
3. A consent request explains who is asking, what will happen, what data is affected and how recovery
   works before the user decides.
4. Waiting for consent never resembles a hung tool call, and a slow human decision does not hit a
   renderer timeout intended for machine work.
5. Completion, failure, cancellation and Undo produce consistent state in Lacuna and the client.
6. The Settings, consent and activity interfaces pass keyboard, screen-reader, narrow-width, zoom,
   theme and reduced-motion checks.
7. No primary user-facing surface exposes raw tool names, UUIDs or serialised validation blobs unless
   the user opens technical details.
8. The complete setup and consent smoke scenario works from a fresh profile without hard-coded paths,
   magic approval counts or manual DevTools clicking.

---

# Arc 3 — Assessment-Aware Revision Planning and Cram (detailed)

> **Status (July 2026): delivered.** All ten §3.6 delivery steps shipped: the unified
> `CourseAssessment` entity (schema v17, `courseAssessments` + `revisionPlans` tables) with
> independent path placement, prefix/custom coverage and exclusions; the assessment editor
> and checkpoint detail sheet; scope-aware Practice/Study now routing through
> `studyFlowSnapshot`/`studyFlowPlanner`/`assessmentPractice`; `ReviewLog` provenance and the
> offline short-term-memory harness under `tooling/short-term-memory`; the benchmark-selected
> half-life-logistic model, now shipped as the frozen, coefficient-routed
> **`half-life-logistic-v3-routed`** (candidate v1 did not clear the later three-cohort
> transfer gate; v3's conservative routing did, and is what actually shipped — `CHANGES.md`'s
> Unreleased entry still names v1 and needs updating to match); persisted `RevisionPlan`
> repository and replan rules; the expected-gain `cramAllocator`; and Learn Mode's
> `assessment-revision` session-kind integration. §3.5's legacy `?mode=cram` query entry is
> confirmed retired (`LearnMode.test.tsx` — "ignores the retired mode=cram query entry"); the
> internal `SessionMode = 'cram'` value in `src/fsrs/session.ts` is unrelated live code, now
> driven only by the new assessment/plan-id routing (`plannedRevision` in `LearnMode.tsx`),
> not by any URL param, so no further removal is outstanding. The sections below record the
> shipped contract rather than a future design.

The document Addendum 2 §G and §M promised. Cram is not a course-wide weak-card queue. It
is a time-budgeted plan for one named assessment, whose authored lesson coverage determines
the material being optimised. The course is only the owning container.

Arc 3 replaces the legacy 48-hour, weakest-first URL mode with three connected pieces:

1. one coherent assessment model for intermediate checkpoints and the final exam;
2. assessment-aware Practice and Study Now routing; and
3. a persistent multi-day planner that maximises assessment-day recall within the learner's
   available time, including a validated seconds-resolution short-term memory model.

Changing from ordinary Practice to Cram remains explicit because the optimisation objective
changes. Direct assessment revision is available whenever that assessment is still in the
future; automatic offers use the existing per-course `practiceUrgentWindowDays`, not another
hard-coded definition of "imminent".

## 3.1 Complete assessment authoring and scoping

Arc 3 must finish the partial `CourseExamDate` implementation before building planning on
top of it. Assessment placement and assessment coverage are separate authored facts; the
current `lessonIds` field incorrectly serves both purposes.

- Replace the split `Course.examDate`/`CourseExamDate` representation with one
  `CourseAssessment` entity in a `courseAssessments` table. Migrate every course's primary
  final exam into a row with `kind: 'final'`; intermediate assessments use
  `kind: 'checkpoint'`. Each course has exactly one final assessment. Any temporary
  compatibility field on `Course` is derived/read-only and is removed once all consumers,
  imports and backups use assessment ids. Do not preserve the misleading
  `CourseExamDate` name after its semantics expand.
- Store an explicit path position (`afterLessonId: string | null`) independently of
  coverage. Reordering lessons preserves the relationship to the anchor lesson. Deleting
  the anchor retargets the assessment to the nearest surviving preceding lesson and marks
  it as needing author confirmation; it must not jump silently to the end of the course.
- Support two coverage modes:
  - **Prefix:** every lesson through the assessment's path position. This is the normal
    "everything taught before the exam" case and must be the low-friction default.
  - **Custom:** an explicit set of lesson ids, independent of path position, for assessments
    that omit earlier lessons or include a non-contiguous selection.
- Reject a custom scope containing a lesson positioned after the assessment. An assessment
  cannot cover curriculum the authored path says has not yet been taught.
- Expose `excludedCardIds` in the assessment editor, with searchable card selection grouped
  by covered lesson. Exclusions affect scheduling, readiness and cram; they do not remove
  cards from lessons.
- Resolve coverage through effective lesson membership, including `LessonCardLink`, rather
  than checking only `Card.primaryLessonId`. Deduplicate a card linked into several covered
  lessons while retaining its single FSRS memory state.
- Remove the ambiguous "no lessons selected" behaviour. Existing unscoped records migrate
  explicitly to prefix/all-through-position coverage; `undefined` must not simultaneously
  mean "all course cards" in scheduling and "lessons taught so far" in the UI.
- Update Course settings so teachers can choose the path position, switch between prefix
  and custom coverage, inspect the resolved lesson/card count, manage exclusions and see
  validation when a referenced lesson or card no longer exists.
- Make checkpoint nodes interactive: open assessment details and start revision for that
  exact assessment. Checkpoints remain non-gating curriculum events.
- Carry the completed representation through repository validation, schema migration,
  backups, share import/export and MCP content tools. Update `SPEC.md`, Help and authoring
  copy so every surface describes the same semantics.
- Add focused tests for independent placement and coverage, prefix expansion, custom
  non-contiguous scopes, exclusions, linked-card membership, deduplication, lesson reorder
  and deletion, invalid future-lesson coverage, overlapping assessments, final-exam
  migration, portability and migration of existing rows.

## 3.2 Cram/Practice assessment resolution

- For each Practice scope, find only future assessments whose resolved lesson coverage
  intersects that scope. Rank them by date; never use the course-wide nearest date without
  checking scope overlap.
- Only the learner's **current active** Practice context offers urgent assessment revision.
  Auto and recurring Practice sessions use all currently reached and exposed lessons, so a
  learner who has reached Lesson 5 cannot receive an ordinary current Practice pool ending
  at Lesson 3. A historical curricular node may retain its fixed prefix solely as its
  milestone denominator, and an explicitly authored manual Practice may deliberately narrow
  its session through `lessonIds`; neither exception redefines the learner's general reached
  scope. A completed older node must not surface as the current revision context.
- Practice is an entry point, not the authority over a Cram pool. Once the learner selects
  an assessment, Cram uses that assessment's full covered scope intersected with all lessons
  the learner has reached and all cards exposed there; it is not truncated to the subset
  that happened to trigger the offer.
- Starting cram for an assessment freezes its assessment id, resolved lesson scope and
  exclusion set for the session. Rebuild and explain the plan if authoring changes invalidate
  that scope while the session is active.
- When several imminent assessments overlap, show the alternatives rather than blending
  their horizons into one meaningless queue. A learner chooses the assessment being
  optimised.
- The final exam is an ordinary assessment target under the same prefix/custom coverage
  rules, not an implicit course-wide special case.
- When Study Now would ordinarily continue the curriculum but an imminent overlapping
  assessment has useful revision work, show an explicit choice between the next Lesson or
  Practice step and revision for the named assessment. Do not silently hijack Study Now in
  either direction.
- Replace course-wide urgency in `shouldInsertPractice` and
  `buildCourseStudyFlowSnapshot` with assessment/scope-aware urgency. An assessment for an
  unrelated lesson set must not activate or tighten thresholds for this Practice context.

## 3.3 Persistent multi-day revision plans

Starting Cram creates or resumes one persisted plan keyed to the assessment. The plan stores
the assessment id and coverage version, the assessment time zone/deadline snapshot, daily
time budgets through the deadline, per-card plan state, completed sessions and the memory-
model version used to produce its projections. Authoring changes, a moved deadline or a
changed model version trigger an explained replan; they do not quietly mutate an active
session under the learner.

- Entry asks how much time is available today, with short preset choices and a custom value.
  Future days initially inherit today's budget so the common path is one decision; an
  expandable schedule editor lets the learner change or remove individual days.
- Convert each daily budget into a planned **window**, not a frozen queue. At the start of
  every window and after every answer, rebuild priorities from the latest card state,
  remaining time, response-time calibration and future windows.
- The eligible pool is:
  ```
  resolved assessment lesson coverage
  ∩ lessons reached by the learner
  ∩ cards exposed through effective lesson membership
  − assessment exclusions
  − unavailable cards
  ```
  Untaught or unreached covered lessons are reported separately with a route back to the
  curriculum; Cram never leaks them as surprise new material.
- Cards have equal assessment importance in Arc 3. Do not add lesson/card weighting yet.
- Estimate each candidate's value from the expected improvement in assessment-day recall
  divided by expected review seconds. Simulate both success and failure from the current
  long- and short-term memory state rather than sorting by `1 - R`:
  ```
  expectedUtility(card) =
    (P(success now) * gainAfterSuccess
      + P(failure now) * gainAfterFailureAndFeedback)
    / expectedReviewSeconds
  ```
- Under `expectedMarks`, maximise the sum of predicted assessment-day recall gains. Under
  `securedTopics`, first maximise the number of cards expected to cross `MASTERY_R`, then
  use recall gain per minute as the tie-breaker. Never spend the budget repeatedly polishing
  already-secure cards while useful work remains.
- A failure always reveals corrective feedback and schedules another attempt at the next
  productive interval. It does not reappear after an arbitrary fixed card count. Repeatedly
  unproductive cards are parked for the current window, shown honestly in the summary and
  reconsidered in a later window; they are not silently discarded.
- Spread successful retrievals across available windows. Prefer one successful retrieval in
  several genuinely spaced sessions over several immediate successes, while the short-term
  model may schedule expanding within-day attempts when the deadline is too close to permit
  another daily window.
- A window finishes when its time budget expires or no eligible card has positive expected
  marginal value. It does not run indefinitely until every card reaches mastery.
- A plan finishes when no scheduled window remains before the assessment. Its summary shows
  cards covered, cards improved, work not reached, predicted readiness with uncertainty and
  the next scheduled window. It must not claim guaranteed marks.
- Cram reviews update genuine card memory, but completing a Cram window or plan never marks
  a curricular Practice milestone complete. Ordinary milestone re-evaluation may later find
  that its full scope is secured; that is a separate fact.
- Once an assessment passes, archive its plan read-only and let normal per-card horizon
  resolution retarget subsequent Practice to the next applicable assessment.

## 3.4 Proper short-term memory model

The installed `ts-fsrs` is FSRS-6 with `enable_short_term: true`, but FSRS-6's same-day
formula primarily improves the next long-term state; it does not provide a calibrated
seconds-to-hours recall curve suitable for Cram planning. Arc 3 therefore needs a separate
short-term predictor that composes with FSRS rather than pretending the existing flag solves
the problem.

This is a research-and-validation task with a hard quality gate:

1. **Data contract.** Extend review history with session/plan provenance and retain exact
   timestamps, grade/correctness, response time and hint/distraction state for every attempt.
   Existing history remains valid. Build chronological training examples at elapsed-second
   resolution without exporting personal data.
2. **Model contract.** Add a pure model interface that predicts recall at an arbitrary
   timestamp and simulates the state after each possible grade. Its short-term contribution
   must decay smoothly into the ordinary FSRS long-term prediction rather than creating a
   discontinuity at midnight or double-counting the same review.
3. **Candidate evaluation.** Implement and benchmark at least: the current FSRS-6 treatment
   as the baseline; a trainable half-life/logistic model using elapsed seconds and recent
   outcome features; and a multi-trace activation model in the ACT-R/Pavlik-Anderson family.
   Do not choose a model because its equation looks plausible.
4. **Fit and personalisation.** Ship conservative global coefficients fitted offline from a
   documented, licence-compatible review dataset. Adapt locally only after a minimum sample
   threshold; before that, shrink user estimates towards the global model. No review history
   leaves the device.
5. **Validation.** Use chronological hold-out data and report log loss, Brier score and
   calibration error across lag buckets (`<1m`, `1–10m`, `10–60m`, `1–6h`, `6–24h`,
   `1–7d`), first-review status and success/failure history. The chosen model must beat the
   FSRS-6 baseline overall without a material calibration regression in a major bucket.
6. **Integration.** Every genuine retrieval continues through the normal FSRS transition so
   long-term scheduling retains the evidence. The short-term model consumes the same event
   for within-day prediction; the combined predictor and grade simulations own Cram
   selection. Add invariants preventing duplicate review events and double state updates.
7. **Fallback.** If coefficients are absent, corrupt or outside their supported feature
   range, fall back explicitly to ordinary Practice/FSRS ordering. Do not run the Cram
   planner on invented confidence values.

Keep training/evaluation tooling outside the browser bundle and persist only the compact
runtime coefficients needed for local inference. Avoid a neural-network runtime dependency
unless the benchmark proves that a simpler calibrated model cannot meet the quality gate.
The evidence base and benchmark starting points are the
[Open Spaced Repetition scheduler benchmark](https://github.com/open-spaced-repetition/srs-benchmark),
Pavlik and Anderson's
[model-optimised practice experiment](https://eric.ed.gov/?id=EJ802557), and Settles and
Meeder's [trainable half-life regression](https://research.duolingo.com/papers/settles.acl16.pdf).
They justify the candidate families and validation method, not a predetermined winner.

## 3.5 Product surfaces

- Make checkpoint nodes interactive. Their detail sheet shows date/time, resolved covered
  lessons, exclusions, current predicted readiness, untaught coverage and **Plan revision**.
- Adapt the existing relevant Practice node rather than inventing a parallel revision-node
  species. Inside `practiceUrgentWindowDays`, show the named assessment and offer
  **Prioritise assessment** alongside ordinary Practice.
- Study Now shows a compact choice when imminent assessment revision competes with the next
  curriculum step. Remember neither choice as a permanent preference.
- The plan setup surface shows today's budget first and keeps future-day editing secondary.
  The active session shows the assessment name, time remaining in this window and the next
  planned window; it does not expose raw model scores.
- Preserve Focus Mode, Pomodoro, grading mode, typing mode, hints, undo and distraction
  reporting through the existing Learn Mode systems. Extend them; do not build a second card
  player for Cram.
- Replace Help, Welcome and stale session copy that promises a 48-hour weakest-first mode.
  Remove the undiscoverable legacy `?mode=cram` entry once all new routes carry an explicit
  assessment/plan id.

## 3.6 Delivery sequence

1. Unified assessment types, schema migration and compatibility reads.
2. Pure coverage/placement resolution, validation and deletion fallback.
3. Assessment editor, checkpoint details, portability/share/MCP propagation and tests.
4. Scope-aware Practice urgency and Study Now choice, still using ordinary Practice.
5. Review-event provenance plus the offline short-term model dataset/evaluation harness.
6. Candidate short-term models, chronological benchmark and documented model selection.
7. Persisted multi-day plan repository and deterministic replan rules.
8. Expected-gain-per-minute allocator, outcome simulation and response-time cost model.
9. Learn Mode integration, failure/retry handling, plan summaries and expired-plan archival.
10. Full product-surface polish, Help/Welcome/SPEC/CHANGES updates and manual end-to-end pass.

Each task lands with focused unit/integration tests. Tasks 5–6 may reject all candidates; if
so Arc 3 stops there and records the evidence instead of shipping a planner whose core
probabilities failed calibration.

## 3.7 Success criteria

1. Teachers can position an assessment independently of prefix/custom lesson coverage,
   manage exclusions and linked cards, and round-trip the result through every portability
   and MCP surface.
2. Final exams and checkpoints use one assessment representation; no caller silently falls
   back to a course-wide date or pool.
3. Practice and Study Now offer only assessments overlapping the learner's current relevant
   scope, and Cram always names one selected assessment.
4. A learner can create, edit, leave and resume a multi-day plan; every window honours its
   budget and replans after new evidence without leaking untaught material.
5. The selected short-term model passes the documented chronological calibration gate and
   composes with FSRS without duplicate or discontinuous memory updates.
6. Card allocation uses expected assessment gain per minute, corrective feedback and
   productive spacing; weakest-first ordering and fixed arbitrary cooldowns no longer drive
   Cram.
7. Cram never completes a curricular Practice milestone by itself, and expired assessments
   archive cleanly while cards retarget the next applicable horizon.
8. Light/dark, keyboard/touch, Focus Mode, Pomodoro, manual/silent grading and type/reveal
   presentation complete the assessment-planning smoke pass in both web and Electron builds.

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

> This section records the Arc 4 implementation as shipped. Arc 3 supersedes its split
> `Course.examDate`/`CourseExamDate` representation, primary-membership-only assessment
> resolution, course-wide Practice urgency and 48-hour weakest-first Cram gate.

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

> **Status (July 2026): implemented.** All five consistency items shipped as part of
> the interleaved Arc 2 task sequence.

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

> **Status (August 2026): delivered.** All 13 tasks of
> [`design/arc6/plan.md`](../design/arc6/plan.md) are implemented, documented in `SPEC.md`,
> `README.md`, `CHANGES.md` and Help, and covered by tests. Deferred as planned:
> asset-bearing distribution (Arc 12), region grouping, per-card playback settings, video,
> and OCR of label text. Remaining human item: the manual pass on a real labelled diagram
> (both card kinds, light and dark, touch and keyboard, web and Electron).

> **Planned in full (July 2026): [`design/arc6/plan.md`](../design/arc6/plan.md).** UI
> directions were mocked and chosen before the plan was written
> ([`design/arc6/mockups-audio.html`](../design/arc6/mockups-audio.html),
> [`design/arc6/mockups-occlusion.html`](../design/arc6/mockups-occlusion.html)). That plan
> supersedes this outline for implementation purposes. Headline decisions: audio ships as a
> Markdown asset embed on ordinary `front_back` cards with global playback settings rather
> than a new `CardType`; occlusion follows the Sequence precedent (own table, generated
> read-only cards, fractional mask coordinates) with a role per region, so masking printed
> label boxes and highlighting an unlabelled feature are two generation rules over one
> annotated image; asset-bearing distribution stays out of scope, with an explicit
> export/publish warning instead, since share codes strip assets.

The original scope agreement, retained for the record:

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

# Arc 7 (detailed) — Classroom Distribution: Versioned Courses and Re-import Merge

> **Status (July 2026): delivered.** All 11 tasks implemented and committed (schema v18,
> pure lineage diff, payload lineage fields, Publish flow, merge importer with
> snapshot-based student-edit detection, lock/detach, merge review panel, auto-accept
> toggle, decode-time merge routing, MCP lineage tools, documentation). A batched code
> review of every commit found the learner-state-safety, merge-correctness, detach and
> lock invariants sound; its one required fix (the auto-accept description overstated
> post-merge visibility) is corrected. Shipped divergences from the plan text are
> recorded in §7.2 (payload keys `i`/`oi`/card `id`; `publishedAt`;
> `LineageIdMapping` content snapshots). Remaining human item: the §7.7 two-install
> manual end-to-end pass (publish → import → republish → merge → conflict → detach).

> Supersedes the Arc 7 outline above for implementation purposes.

## 7.1 Architectural decisions

**Publish is explicit, not derived.** Versioning is a teacher-initiated **Publish** action
that bumps a revision counter on the course; there is no content hashing anywhere in this
arc. A hash-based scheme would let two independent unpublished edits collide or diverge
silently; an explicit counter means "what revision is this share code" is always a single
integer comparison, and the teacher controls exactly when a batch of edits becomes
distributable. Publishing does **not** lock the teacher's own course — they keep editing
and republishing freely, exactly as today. What becomes read-only is the **student's
imported copy**, and only that copy.

**Lock enforcement lives in the existing stub.** `src/course/lessonViewMode.ts`'s
`canEditLessons(course)` already exists for exactly this purpose — its comment says so
verbatim ("Today there is no locked-course concept, so this always returns true — but it
is the ONE place that decision lives"). This arc is the first caller to make it return
`false`. It gains one check: `canEditLessons` returns `false` iff
`course.distributedCopy?.locked === true`, so an absent `distributedCopy` (every ordinary
course, including all pre-Arc-7 courses) or a detached copy (`locked: false`) both remain
editable, and only a still-locked distributed copy is read-only — see §7.2 for the field.
Every call site already routes through `canEditLessons`/`resolveLessonViewMode`
(`LessonView`, settings toggles), so no new call sites are needed; the behaviour change is
entirely inside the gate.

**Escape hatch: detach.** A locked copy that can never be unlocked would trap a student who
wants to annotate or restructure their own copy. A student may explicitly **detach** an
imported course, which sets `distributedCopy.locked = false` and severs `lineageId`
tracking (a detached course no longer matches on re-import — see §7.4) — a one-way action,
surfaced as a confirm dialog reusing `ConfirmInline` (`src/components/ui/ConfirmInline.tsx`,
Arc 2 Task 1) with `variant="destructive"` framing ("You'll be able to edit this course
freely, but future updates from your teacher will create a separate copy instead of
merging"). This mirrors the merge-importer's own "no lineage, treat as new" fallback (§7.4),
so detach is not a special case to build — it is the same code path a pre-Arc-7 import
already takes.

**Auto-accept scope: per-course, not global.** A student who wants incoming teacher edits
applied silently is expressing a preference about their relationship to *one* teacher's
material, not a blanket preference for every future distributed course they ever import
(a language course from one teacher and a maths course from another have no reason to
share this setting). A single field on the student's imported `Course`
(`distributedCopy.autoAcceptUpdates: boolean`, default `false`) is simpler to reason about
than a global setting with per-course overrides, and avoids a second settings surface.

**Payload extension: additive v2, not a v3 envelope.** The alternative — a new
`SharePayloadV3` — would duplicate `SharePayloadV2`'s ~20 fields for a change that is
genuinely additive: every new field (originating ids, lineage id, revision number) is
optional and a v2 payload without them still parses and imports exactly as it does today
(pre-Arc-7 codes, and even Arc-7-built codes for non-distributed exports where the teacher
never published, carry no lineage). `SharePayloadSchema`'s `z.discriminatedUnion('v', ...)`
(`src/db/share.ts:184`) would have to special-case "v3 is v2 plus five fields" anyway, so a
new discriminant tag buys nothing and doubles the schema surface to maintain. Compact-key
convention is preserved: new single-letter/short keys (`li` for lineage id, `rv` for
revision, `i` for originating id on lessons/notes/cards) sit alongside the existing `l`
(links), `c` (card id), etc. at `src/db/share.ts:92-183`.

**Id adoption over a mapping table.** Today `importCourseSharePayload`
(`src/db/share.ts:1038`) always remaps every id via `makeId()`, using transaction-local
`cardIdMap`/`itemIdMap` (`share.ts:1061,1107`) that are discarded once the transaction
commits — by design, since every import today is an independent copy. A lineage-aware
merge needs the *next* import of the same lineage to recognise "this incoming card is the
same card I already have" without re-deriving that mapping from content. Two ways to get
there: (a) keep local ids and persist a durable id-mapping table across imports, or
(b) have the merge path **adopt the originating id directly** for lineage-tracked entities,
so the incoming payload's packed id *is* the local id and no mapping table exists at all.
(b) is chosen. Collision risk is the objection to id adoption, but it does not apply here:
`makeId()`'s ids are globally unique regardless of which install generated them (same
scheme used for the teacher's originals), and the merge path only ever writes ids that
originated from `makeId()` on the teacher's own local database — there is no
attacker-controlled or cross-scheme id space to collide with. A durable mapping table would
need its own schema-versioned table, its own portability-checklist obligations (§7.7), and
introduce a permanent indirection between "the id the diff engine reasons about" and "the id
the learner-state tables key on" — exactly the ambiguity id adoption avoids. The remaining
risk — a student having independently created a lesson/card that happens to collide with an
adopted id — is already structurally impossible: `makeId()` never repeats, and locally
authored content in a locked copy cannot exist (§7.1's lock). First import of a
lineage-bearing payload therefore diverges from `importCourseSharePayload`'s `makeId()`
remapping for exactly this case: the merge path (§7.5) adopts the incoming `i` on every
lesson/note/card directly as the local id, and records those adopted ids in
`LineageIdMapping` (§7.2) purely as a **membership registry** — "which ids has this course
already adopted from this lineage" — never as a translation table, since there is nothing
to translate: incoming id and local id are the same value by construction. A plain
(non-distributed) share code with no lineage id is entirely unaffected and continues to go
through `importCourseSharePayload`'s existing `makeId()` path exactly as it does today.

**Merge importer is a new path, not a branch inside the existing one.**
`importCourseSharePayload` stays untouched for the no-lineage case (backwards compatibility
is not a goal here — see §7.6 — but *not breaking today's working import* is). A new
`src/db/mergeImport.ts` handles the "lineage already present locally" case: it loads the
existing course's originating-id mapping (§7.2), runs the pure diff (§7.3) against the
incoming payload, and applies the result under the review rules in §7.5. The SharePage/
UnifiedImportPanel decode step (§7.6) decides which path to call based on whether the
decoded payload's `li` (lineage id) matches a `lineageId` already present locally.

**Sequences never get touched directly.** Sequence content changes packed in a lineage
update are not diffed by the new engine at all — they are handed to the *existing*
`diffRegeneration` (`src/db/sequenceGeneration.ts:217`) exactly as a local sequence edit
would be, because that function already encodes the one rule that matters here: "updates
content only, never FSRS/scheduling fields," keyed by the stable `sequenceItemId`. Building
a second sequence-diff engine for the merge path would risk the two diverging on card
generation semantics; routing through the same function guarantees they cannot.

## 7.2 Data model

**`Course` gains a `distributedCopy` field** (schema v18, additive — `CURRENT_SCHEMA_VERSION`
is `17` in `src/db/schema.ts:528`):

```typescript
interface CourseDistributedCopy {
  lineageId: string;          // matches the teacher's ShareCourse lineage id
  revision: number;           // last-imported/merged revision number
  locked: boolean;            // true unless the student has detached
  autoAcceptUpdates: boolean; // default false; see §7.1
  sourceLabel?: string;       // optional "shared by" display string, mirrors `by` in SharePayloadV2
}

interface Course {
  // ...
  distributedCopy?: CourseDistributedCopy; // absent = not a distributed copy (today's default)
}
```

Presence of `distributedCopy` is the single flag `canEditLessons` checks (§7.1); its
absence is exactly every course that exists before this arc ships, and every course a
teacher authors locally, so no migration touches existing rows (Dexie v18 upgrade adds the
field to the schema only, no `.upgrade()` data pass needed — same "additive, no existing
data changes" pattern as sequences' schema v10, next_plan.md §1.2).

**A new table carries the adopted-id membership registry** — not a translation table, since
adopted ids and local ids are the same value (§7.1) — created on first import of a lineage
and consulted (never mutated except to add newly-created entities) by every subsequent
merge, to answer "is this incoming id already present locally" without a database scan:

```typescript
interface LineageIdMapping {
  id: string;           // = lineageId, one row per distributed course
  courseId: string;     // the local Course this mapping belongs to
  lessonIds: string[];  // originating ids already adopted as local ids
  noteIds: string[];
  cardIds: string[];
  sequenceIds: string[];
}
```

New Dexie table, schema v18: `lineageIdMappings: 'id, courseId'`. Kept separate from
`Course` itself (rather than an inline array) so it is not serialised into every
`useLiveQuery` course read and so the portability checklist (§7.7) treats it as one clean
additive table, matching the "six Phase-1 tables"/sequences precedent (next_plan.md
§1.2/§1.3) rather than growing `Course`'s already-large field list further.

**Teacher side: `ShareCourse` gains `lineageId` and `revision`.** `lineageId` is generated
once, the first time a teacher clicks Publish, and stored on the teacher's own `Course`
(reusing the same `distributedCopy`-shaped field would be wrong here — the teacher's course
is the *origin*, not a copy — so the teacher side gets its own minimal
`{ lineageId: string; revision: number; publishedAt: number }` triple, e.g.
`Course.distribution` optional field, separate from `distributedCopy`. `revision`
increments by exactly 1 on every Publish; `publishedAt` records the epoch-ms timestamp of
the most recent Publish call.

**Payload additions (`SharePayloadV2`, `src/db/share.ts:303-317`), all optional so a
non-distributed export is byte-for-byte unaffected in shape:**

```typescript
interface SharePayloadV2 {
  // ...existing fields unchanged...
  li?: string; // lineageId, present iff the teacher has published at least once
  rv?: number; // revision, present iff `li` is present
}

// ShareLesson, ShareNote, ShareCard each gain an optional originating id:
interface ShareLesson { /* ... */ i?: string; }
interface ShareNote   { /* ... */ i?: string; }
interface ShareCard   { /* ... */ i?: string; }
```

`i` is populated only when `li` is present (a plain course export/import — sharing a course
that was never published — carries no ids and behaves exactly as today; there is nothing to
merge against). `ShareLessonSchema`/`ShareNoteSchema` (`share.ts:92,99`) currently carry no
id field at all — this is a genuinely new capability for those two schemas, not a rename.

> **Shipped divergence:** `ShareCard` already used `i?: 1` for the pre-existing
> "images omitted" flag, so the originating-id key could not also be `i` there without a
> collision. As implemented, `ShareCard` reuses its existing (already-optional) `id` field
> as the originating card id — no new key at all — and `ShareNote` carries the originating
> note id under `oi` ("originating id") instead of `i`. Only `ShareLesson` uses `i` as
> planned, since it has no competing use of that letter. `SharePayloadV2.li`/`rv` shipped
> exactly as written above.

**Queue-for-review persistence.** Pending merge decisions (§7.5) are not silently
discarded if the student closes the app mid-review — they are written to a new
`pendingMergeReviews` table (schema v18) keyed by `id, courseId`, one row per merge import,
holding the diff result (§7.3's shape, with local ids resolved) until the student resolves
or the next re-import supersedes it. This is the same "durable pending state" pattern
`UnifiedImportPanel`'s `pending`/`sharePending` local state already models for the
first-import confirm step (§7.6), just persisted because a merge review can be a much
longer decision (a whole lesson's worth of edited cards) than a single import confirm click.

## 7.3 Pure diff module

**`src/db/lineageDiff.ts` (new, pure, no Dexie import)** — the generalisation of
`diffRegeneration`'s shape (`sequenceGeneration.ts:217-252`) from "one sequence's cards"
to "a lineage's lessons, notes, and cards":

```typescript
interface LineageDiffInput {
  incoming: { lessons: ShareLesson[]; /* notes/cards nested as in SharePayloadV2 today */ };
  existing: { lessons: Lesson[]; notes: Note[]; cards: Card[] };
  mapping: LineageIdMapping; // resolves incoming `i` -> existing local id
  studentEdits: Set<string>; // local ids the student has touched since last merge (§7.5)
}

interface LineageDiffResult {
  creates: { lessons: Lesson[]; notes: Note[]; cards: Card[] };
  updates: { lessons: LessonUpdate[]; notes: NoteUpdate[]; cards: CardUpdate[] };
  removals: { lessonIds: string[]; noteIds: string[]; cardIds: string[] };
  conflicts: { entityId: string; kind: 'lesson' | 'note' | 'card'; incoming: unknown }[];
}
```

Keyed on the mapping's stable local ids exactly as `diffRegeneration` is keyed on
`sequenceItemId` — never on array position or content matching. This is deliberately **not**
built on `src/mcp/diffImport.ts`: that module (Arc 2 §2.3) matches on front/back text
similarity for card-only, single-course-scope import preview, which is the right shape for
"does an agent's proposed card already exist" but wrong for "is this the same entity across
two versions of the same course" — id-keyed diffing is strictly more precise once a stable
id exists, and generalises to lessons and notes, which `diffImport.ts` does not handle at
all. `diffImport.ts`'s three-way `create`/`skip`/`update` classification is kept as UX
precedent (the review UI, §7.5, presents the same three buckets plus a fourth,
`remove`/`conflict`), but the matching logic itself is new.

**Classification rules** (pure functions, exhaustively tested before any UI, per house
convention):

- Key only in incoming → `creates`.
- Key in both, content differs, local id **not** in `studentEdits` → `updates` (applied per
  §7.1's default, or queued if `autoAcceptUpdates` is false — §7.5 owns the apply-vs-queue
  decision; the diff module only classifies, never decides review policy).
- Key in both, content differs on **both** sides (local id in `studentEdits` *and* incoming
  differs from the mapping's last-known-synced content) → `conflicts`, with the student's
  local version left untouched and the incoming version attached for review.
- Key only in existing (present locally, absent from incoming) → `removals`.
- Card diffs never touch FSRS/scheduling fields, mirroring `diffRegeneration` exactly — the
  `CardUpdate` shape in the diff module is a strict subset of `Card` excluding `state`,
  `stability`, `difficulty`, `due`, `reps`, history, and any other engine-owned field.
- Sequences are excluded entirely from this module's scope — see §7.1, they route to
  `diffRegeneration` instead.

## 7.4 Publish flow (teacher side)

1. Teacher clicks **Publish** (new button, course-level, alongside the existing share-code
   export entry point — exact placement decided in Task 2 against
   `UnifiedExportPanel.tsx`'s current layout).
2. If `Course.distribution` is absent, generate a `lineageId` (`makeId()`) and set
   `revision = 1`; otherwise increment `revision`.
3. Generate the share code exactly as today (`buildShareCode`/course export path in
   `src/db/share.ts`), now packing `li`/`rv` and every lesson/note/card's originating `i`
   (its own local id on the teacher's course — no mapping needed on the teacher side, since
   the teacher's ids never get rewritten).
4. No lock, no state change to the teacher's own course — they can keep editing and publish
   again at any time. Publish is idempotent to call repeatedly (each call just bumps
   `revision` and re-encodes current state), consistent with Arc 2's "tools should be
   idempotent" requirement even though this is a UI action, not an MCP tool, today.

## 7.5 Merge importer + review UI (student side)

**Decode-time branch.** `SharePage`/`UnifiedImportPanel`'s existing decode → `summariseShare`
→ confirm → write flow (`src/pages/SharePage.tsx`, `src/components/import/
UnifiedImportPanel.tsx`) gains one branch after decode: if the payload carries `li` and a
`Course` with matching `distribution.lineageId` (teacher re-sharing) is irrelevant — the
check is against the **student's own** `distributedCopy.lineageId` values. If one matches,
route to the merge path; otherwise fall through to `importCourseSharePayload` exactly as
today (this covers both genuinely new courses and, per §7.1's no-backwards-compatibility
decision, any course whose local copy predates this arc and so has no `distributedCopy` to
match against — it simply imports as new, identically to current behaviour).

**Merge apply, in order:**
1. Run `lineageDiff` (§7.3) against the mapping and current local state.
2. New lessons/notes/cards (`creates`) are written immediately — nothing to review, purely
   additive, mirrors how `diffRegeneration`'s creates are unconditional.
3. `updates` and `removals`: if `distributedCopy.autoAcceptUpdates` is true, apply
   immediately (updates as content-field writes identical to `diffRegeneration`'s update
   shape; removals as ordinary deletes through the existing repository delete functions, so
   snapshot/undo behaviour is inherited for free). If false (the default), write to
   `pendingMergeReviews` (§7.2) instead and surface a badge/notification — nothing is
   applied silently.
4. `conflicts`: **always** queued regardless of `autoAcceptUpdates` — the setting governs
   accepting the *teacher's* incoming edits when the student hasn't touched that entity, not
   overriding a student's own edit. The student's local version is left in place either way;
   the incoming version sits in the queue purely for visibility/optional manual accept.
5. Sequence-shaped items in the incoming payload are extracted and handed to
   `diffRegeneration` unconditionally (its creates/updates/deletes apply through the
   existing sequence-regeneration repository path, not through this arc's new apply logic)
   — see §7.1.
6. On completion, update `distributedCopy.revision` to the incoming `rv` and update
   `lineageIdMappings` with any newly created entities' ids. Consistent with §7.1's id
   adoption decision, `creates` on the student side adopt the incoming `i` directly rather
   than generating a fresh local id — student and teacher ids stay identical for the whole
   lineage, so a later merge needs no separate reverse-lookup for entities created after
   the first import; the collision analysis in §7.1 covers this case too.

**Review UI.** New `src/components/import/MergeReviewPanel.tsx`, extending the existing
pending/confirm scaffold's visual language (`UnifiedImportPanel.tsx`'s summary-then-confirm
pattern) rather than inventing a new interaction shape: one list, grouped by lesson, each
row showing old/new content side by side for `updates`/`conflicts` and a removal marker for
`removals`, with per-row accept/reject and a bulk "accept all" (which, notably, is the
manual equivalent of what `autoAcceptUpdates` does automatically next time). Reached via a
new entry point (a "pending updates" indicator on the course card/settings) rather than
forcing review at import time, since a merge can arrive while the student is mid-lesson.

**Setting surface.** `autoAcceptUpdates` toggle lives in the course's existing settings
surface (student-facing course settings, exact section TBD against current settings
layout in Task 2) rather than a new global preferences page, consistent with the
per-course scoping decision in §7.1.

## 7.6 MCP tools

Following the Arc 2 conventions in `src/mcp/`: tool definitions as thin wrappers, zod input
schemas, no parallel logic path. Two new tools, read/diff-tier (no consent gate, matching
the existing `diff_import_preview`'s no-write-until-confirmed shape):

- `lacuna.diff_lineage_update(courseId, shareCode: string)` — decodes the payload, resolves
  the lineage mapping, runs `lineageDiff` (§7.3), and returns the classification
  (`creates`/`updates`/`removals`/`conflicts` counts and entity summaries) without writing
  anything — the MCP-surfaced equivalent of the review panel's preview step, letting an
  agent inspect what a re-import would do before a human commits to it.
- `lacuna.apply_lineage_update(courseId, shareCode: string, decisions?: {...})` — write-tier,
  consent-gated per §2.4's existing grant model (course-scoped write grant), applies the
  merge exactly as §7.5 describes; `decisions` lets an agent pre-resolve specific
  conflict/update ids (mirroring how a human would use the review panel) while anything
  unresolved still lands in `pendingMergeReviews` rather than being silently skipped.

No new tool-surface version bump is required (`MCP_TOOL_SURFACE_VERSION`,
`src/mcp/registry.ts` — Arc 2 §2.5) since these are additive tools, not changes to existing
ones.

## 7.7 Testing strategy

- **`src/db/lineageDiff.ts`** — pure, table-driven Vitest tests covering every
  classification rule in §7.3 independently: create/update/remove/conflict, FSRS-field
  exclusion on updates, and the `studentEdits` interaction with a simultaneous incoming
  change (the conflict case specifically). Same "exhaustive tests before any UI" bar as
  `diffRegeneration`'s own test suite.
- **`src/db/mergeImport.ts`** — Vitest + `fake-indexeddb/auto` (the `repository.test.ts`
  harness), covering: first import of a lineage (mapping created, ids adopted), a
  no-op re-import (revision unchanged, empty diff), an `autoAcceptUpdates=true` merge
  (silent apply), an `autoAcceptUpdates=false` merge (queued, nothing applied until
  resolved), a removal, a conflict (student edit preserved, incoming queued), and a
  sequence-bearing payload confirming it is routed through `diffRegeneration` rather than
  the new engine (assert on `sequenceItemId`-keyed cards, not lesson/note/card ids).
- **`canEditLessons`** — extend the existing (currently trivial) coverage with cases for
  `distributedCopy.locked = true` (false) and detached (`locked = false`, true).
- **Detach flow** — component test on the confirm dialog plus a repository-level test that
  detach clears lineage tracking without deleting content.
- **`MergeReviewPanel.tsx`** — component tests with a fixture diff result, covering
  per-row accept/reject and bulk accept, colocated per convention.
- **MCP tools** — unit tests calling handlers directly with a stub `ToolContext`, matching
  Arc 2 §2.7's pattern; `diff_lineage_update` asserted read-only (no repository writes) via
  the fake-IndexedDB harness.
- **Manual end-to-end pass** — publish from one local install's exported course, import into
  a second, edit both sides, republish, re-import, and walk the review UI — the automated
  suite cannot exercise two independent Dexie instances at once.

## 7.8 Out of scope

- **Any backwards compatibility for pre-Arc-7 share codes or courses.** Lacuna is in
  private early testing (two users) at the time of this arc; a course imported before this
  ships has no `distributedCopy`/`distribution` fields and no lineage id, so re-importing an
  updated code for it simply creates a new course, exactly as it does today. No migration
  path retrofits lineage onto pre-existing imports.
- **Bidirectional/cloud sync** — remains Arc 8. The prompter's "opt-in sharing cloud" idea
  (a possible future option where students/teachers opt into a hosted relay rather than
  copy/paste share codes) is parked for the Arc 8 design discussion, not decided here.
- **Multi-teacher merge** (a course imported from two different lineages, or re-parented to
  a different teacher's lineage) — a single `distributedCopy` per course is assumed
  throughout; no fan-in.
- **Automatic conflict resolution beyond "student wins, incoming queued."** No three-way
  content merge at the field level (e.g. merging a student's typo fix with a teacher's
  unrelated content rewrite into one card) — conflicts always queue the whole entity.
- **NoteAnnotation portability** — already out of scope for every existing portability
  surface (device-local, excluded from share codes and backups today); this arc does not
  change that.
- **Locking anything other than lesson/note/card CRUD.** Sequence editing, exam dates, and
  course settings on a locked copy are not addressed by this arc's `canEditLessons` gate —
  if those also need locking, that is a follow-up scoping question, not assumed here.

## 7.9 Task list

Each task is scoped for one subagent, ends in one commit, and includes its own tests
(except the final documentation/manual-pass task, which has no unit-testable surface).

1. **Schema v18: `distributedCopy`/`distribution` fields on `Course`,
   `lineageIdMappings` table, `pendingMergeReviews` table.** Additive Dexie migration in
   `src/db/schema.ts` (no `.upgrade()` data pass needed — new fields/tables only), type
   additions in `src/db/types.ts`. Migration test with a pre-migration snapshot per house
   convention, confirming existing courses import unchanged.

2. **`src/db/lineageDiff.ts` — pure diff module.** Implement §7.3 in full: types,
   classification functions, exhaustive table-driven tests. No Dexie import, no UI. This is
   the "generalise `diffRegeneration`'s shape" step and must land before anything calls it.

3. **Payload extension: `li`/`rv`/`i` fields on `SharePayloadV2`/`ShareLesson`/
   `ShareNote`/`ShareCard`.** Extend the zod schemas at `src/db/share.ts:92-183`, extend
   `buildShareCode` (or equivalent export path) to pack the new fields when
   `Course.distribution` is present, leave everything else in `share.ts` untouched. Tests
   assert a payload without `li` round-trips byte-identically to today's behaviour.

4. **Publish flow (teacher side).** New Publish action per §7.4: `lineageId`/`revision`
   management on `Course.distribution`, wiring into the export UI
   (`UnifiedExportPanel.tsx` or the course-level entry point decided against current
   layout). Tests cover first-publish (lineage id created) and republish (revision
   incremented, same lineage id).

5. **`src/db/mergeImport.ts` — merge importer.** First-import-of-a-lineage path (id
   adoption into `lineageIdMappings`, per §7.1/§7.2) and the merge-apply path (§7.5 steps
   1-6), including the `diffRegeneration` handoff for sequence-shaped payload items and the
   `pendingMergeReviews` write for queued items. Full `fake-indexeddb/auto` test coverage
   per §7.7's `mergeImport.ts` bullet.

6. **`canEditLessons` gate + detach flow.** Wire `distributedCopy.locked` into
   `src/course/lessonViewMode.ts:canEditLessons` (one-line body change plus updated
   comment), new detach action (repository function clearing lineage tracking, confirm UI
   using `ConfirmInline`). Tests per §7.7.

7. **`MergeReviewPanel.tsx` + pending-updates entry point.** Review UI per §7.5, reading
   `pendingMergeReviews`, per-row/bulk accept-reject, wired to a new indicator on the
   course card or settings. Component tests with a fixture diff.

8. **`autoAcceptUpdates` setting UI.** Toggle in student-facing course settings (exact
   section decided against current settings layout), wired to `distributedCopy
   .autoAcceptUpdates`, threaded into the merge-apply decision in Task 5's code (no logic
   change there — this task only adds the UI and confirms the existing branch reads the
   real setting instead of a default).

9. **Decode-time branch: SharePage/UnifiedImportPanel merge routing.** The lineage-match
   check described in §7.5, added to both `src/pages/SharePage.tsx` and
   `src/components/import/UnifiedImportPanel.tsx`'s decode step, routing to `mergeImport.ts`
   when a matching local lineage exists and falling through to `importCourseSharePayload`
   otherwise. Tests/manual check that a plain (non-distributed) import is unaffected.

10. **MCP tools: `diff_lineage_update`/`apply_lineage_update`.** Per §7.6, following the
    Arc 2 tool-definition conventions exactly (zod schemas, `ToolContext`, registry entry).
    Unit tests with a stub context per Arc 2 §2.7's pattern.

11. **Documentation + manual end-to-end pass.** `SPEC.md`/`CHANGES.md` updated with the new
    Course fields, tables, and MCP tools; this section's status line updated once complete
    (per the Arc 1/Arc 2/Arc 4 "Status: delivered" precedent); the two-install manual pass
    from §7.7's last bullet run and its outcome recorded here.

## 7.10 Risks

- **Id adoption diverging from local id generation elsewhere** (low): if any other code
  path assumes all lesson/note/card ids in a course were locally generated (e.g. an
  ordering or prefix assumption), adopted ids from a teacher's install could violate it.
  Mitigated by `makeId()` having no install-specific structure to begin with — audited in
  Task 5 by grepping for any code that parses or orders on id shape rather than treating it
  as opaque.
- **Queued reviews accumulating indefinitely** (medium): a student who never opens the
  review panel keeps a growing `pendingMergeReviews` backlog across repeated re-imports.
  Mitigated by each new merge superseding rather than appending to the previous pending row
  for the same course (Task 5), so the backlog is always "latest outstanding diff," not a
  history.
- **Conflict classification depending on `studentEdits` tracking being complete** (medium):
  if the mechanism for knowing "the student touched this entity since last merge" (§7.3)
  under-detects edits, a student's change could be silently overwritten by an
  `autoAcceptUpdates` merge instead of correctly conflicting. This needs its own decision
  in Task 5 — a plausible approach is comparing current content against the mapping's
  last-merged snapshot rather than a separate dirty-flag, avoiding a new field to keep in
  sync; Task 5's tests must cover the "student edited, no merge since" case explicitly.
- **Detach as a silent data-loss vector** (low): a student who detaches, believing it only
  "unlocks" the course, then never receives updates again with no future warning.
  Mitigated by the confirm-dialog copy in §7.1 stating the consequence explicitly; no
  further mitigation planned (this is an intentional, informed one-way action).

## 7.11 Success criteria

1. A teacher can Publish a course, share the code, and a student importing it for the first
   time gets an ordinary import with lineage tracking established silently underneath —
   indistinguishable from today's import UX.
2. Re-importing an updated code against an already-imported lineage never duplicates the
   course: it applies additive content immediately, and by default queues
   teacher-originated edits and removals for review rather than silently changing the
   student's course.
3. A student edit to an entity that the teacher also changed is never silently lost: the
   student's version remains active and the incoming version is queued, never both applied
   nor either discarded.
4. `autoAcceptUpdates` toggled on for a course causes subsequent merges to apply teacher
   edits/removals without a review step, while conflicts (student also edited) still queue.
5. Sequence content changes flow through the unmodified `diffRegeneration` path, verified by
   a test asserting no `lineageDiff.ts` code path ever writes a generated card directly.
6. A locked (non-detached) student copy blocks lesson/note/card CRUD via `canEditLessons`;
   detaching immediately restores full editing and the copy no longer merges on future
   re-import of the same code.
7. `diff_lineage_update`/`apply_lineage_update` work identically to the in-app review flow
   from an MCP client, verified by unit tests against a stub context.
8. A pre-Arc-7 course (no `distributedCopy`) re-imported with an Arc-7-published code simply
   creates a new course, with no error and no attempted merge.

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
4. **Encrypted snapshot blobs over the Arc 12 relay** — the full state is a
   `BackupFile`-shaped snapshot, end-to-end encrypted, pushed/pulled through the same
   self-hostable relay Arc 12 introduces for receipts. Merge on pull reuses the existing
   backup merge importer: newest-wins per content record, and review histories merged by
   set-union on `ReviewLog.eventId` followed by an FSRS recompute from the merged log
   (option 2's append-only insight without the CRDT layer). Blind last-write-wins on the
   whole blob is explicitly ruled out — it silently discards the losing device's
   sessions. Image assets travel separately, addressed by their existing content hash,
   so state blobs stay small.

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

# Arc 10 — UI De-clutter and Navigation Restructure (detailed)

> **Status (July 2026): delivered.** All 7 implementation tasks shipped: Study Today
> folded into the Dashboard with a `/study` redirect shim and the stale `learn` sidebar
> entry dropped; the shared `CourseTabs` component adopted on all four course surfaces;
> return-to-origin back-links for the card and sequence editors; a shared `SectionRail`
> scrollspy (with a mobile jumper fallback) extracted from global Settings and reused by
> Course Settings; Course Settings regrouped into five sections with one instant-commit
> save model, replacing the old split staged/instant behaviour (a genuine user-facing
> change, called out in `CHANGES.md`); a command-palette affordance in the sidebar,
> Help/Method cross-links, and Analytics cross-links; and an upcoming-assessments strip
> on the course path. `SPEC.md`, `CHANGES.md` and in-app copy are updated accordingly.
> The one deliberate deferral on record is §10.5's — splitting `LearnMode.tsx` — which
> was never part of this arc's scope.

Motivated by a July 2026 audit of the UI's growth-by-accretion: after the Course
architecture landed, several surfaces were bolted on beside existing ones rather than
replacing them, leaving redundant entry points, hidden features, and two settings pages
with no internal structure. This arc removes duplication and makes existing features
findable. It adds **no new capabilities** — every change is navigation, layout, or
consolidation of things that already exist.

Audit findings this arc addresses:

- **Four "start studying" surfaces.** Dashboard (`/`), StudyToday (`/study`),
  CoursePath's own Study/Review-due buttons, and `CourseStudyFlow` (the real session
  page) — the first three are parallel launchers for the fourth. StudyToday
  (`src/pages/StudyToday.tsx`) duplicates the Dashboard's course enumeration with a
  second, simpler card layout whose only action is `navigate('/course/:id/study')`.
- **No persistent course-level navigation.** Question bank, course analytics and course
  settings are reachable only from small links/icons in CoursePath's breadcrumb row
  (`CoursePath.tsx:380–405`). From QuestionBank, CardEditor, SequenceEditor or
  CourseAnalytics there is no way sideways — only back out and in again.
- **CourseSettings is nine heterogeneous concerns in one flat scroll** with no sub-nav
  (unlike global Settings' scrollspy rail), and a split save model: name/scheduling/
  unlock/practice/view-mode are staged behind a sticky "Save changes" button
  (`CourseSettings.tsx:139–225`) while ExamDates, LessonManagement and PracticeNodes
  sections commit instantly. A user cannot tell which edits are pending.
- **Hidden features.** The command palette (`Ctrl/Cmd+K`, `CommandPalette.tsx`) has no
  visible affordance anywhere. `/method` is linked only from `/welcome`, which never
  shows again after first run, so the page is permanently orphaned. Sequences are
  reachable only via QuestionBank. Global Settings' scrollspy rail is `hidden xl:block`,
  so mobile gets no wayfinding at all.
- **Naming drift.** The sidebar nav item has id `learn`, label "Study today" and route
  `/study`, while `/learn` is a different page (LearnMode) — three names for adjacent
  things.

## 10.1 Merge StudyToday into Dashboard

The Dashboard becomes the single answer to "what do I study now?".

- Each Dashboard course card gains a direct **Study** action routing to
  `/course/:id/study` — the same target StudyToday's rows used. The card's existing
  click-through to CoursePath is unchanged; Study is an explicit secondary action on the
  card, not a change to the card's primary navigation.
- StudyToday's one unique element — the "resume active session" banner driven by
  `readActiveStudyFlow()` (`StudyToday.tsx:22–23`) — moves to the top of the Dashboard.
- Delete `StudyToday.tsx` and its test; `/study` becomes a redirect to `/` (same shim
  pattern as `/deck/:deckId`, `App.tsx:93–95`) so bookmarks and muscle memory survive.
- Remove the `learn` nav item from `DEFAULT_NAV_ITEMS`
  (`src/state/sidebarSettings.ts`). `readStored()` currently only merges *added*
  defaults into stored settings; it gains the inverse — dropping stored items whose id
  no longer exists in `DEFAULT_NAV_ITEMS` — so existing installs don't keep a dead
  entry. `SidebarSection`'s reorder/visibility UI needs no change beyond the shorter
  list.

## 10.2 Course-level tab navigation

Replace CoursePath's breadcrumb-row link cluster with a shared course navigation
component rendered on **all four course surfaces**.

- New `src/components/course/CourseTabs.tsx`: Path · Question bank · Analytics ·
  Settings, active tab derived from the route, styled to match the existing header
  vocabulary (this answers the long-standing "question bank has no tab" note).
- Rendered by CoursePath, QuestionBank, CourseAnalytics and CourseSettings, so course
  sections are one click from each other in any direction. The "All courses" breadcrumb
  stays; the ChartIcon/SettingsIcon icon links and the bare "Question bank" text link go.
- `LessonViewModeToggle` stays on CoursePath only (it configures the path view, not the
  course) — it moves out of the breadcrumb row into the path header area.
- CardEditor and SequenceEditor keep their focused back-link (they are editors, not
  sections) but the back-link targets the surface the user came from — QuestionBank when
  opened from the bank, the lesson when opened from a lesson — rather than always
  "Back to dashboard" (`CardEditor.tsx:233`).

## 10.3 CourseSettings restructure and one save model

- Group the nine sections under headed groups with the same scrollspy side-rail pattern
  as global Settings (extract the rail from `Settings.tsx` into a shared component
  rather than duplicating it): **Basics** (name, exam objective), **Study** (scheduling
  fields, unlock mode, auto-practice, lesson view mode, optimisation), **Content**
  (lesson management, practice nodes), **Assessments** (exam dates/assessments),
  **Danger zone**.
- **One save model: instant commit everywhere.** The staged blocks convert to the
  ExamDates/LessonManagement pattern — text/numeric inputs commit on blur, toggles and
  selects on change, each through the existing `updateCourse` path. The sticky "Save
  changes" bar and the staged local state in `handleSave` go. Chosen over staging
  everything because three sections already commit instantly (so instant is the smaller
  change), the repository already has undo patterns for the destructive cases, and a
  sticky save bar on a page this long is exactly the pending-state ambiguity the audit
  flagged. Numeric scheduling fields keep their existing validation/clamping on blur so
  a half-typed value never commits.
- The shared scrollspy rail also gets a mobile fallback (a compact sticky section
  jumper, or at minimum visible group headings) so wayfinding no longer disappears
  below `xl` — applied to both CourseSettings and global Settings since the component
  is now shared.

## 10.4 Discoverability fixes

1. **Command palette affordance.** A visible search control in the sidebar (replacing or
   augmenting the bare "Search" nav link) showing the `⌘K`/`Ctrl+K` shortcut, opening
   the palette on click; the `/search` page mentions the shortcut too.
2. **`/method` re-linked.** The Help page links to the Method page (and Method gains a
   route back to Help); `/method` stops being reachable only from the never-again-shown
   `/welcome`.
3. **Assessments surfaced outside settings.** CoursePath already renders checkpoint
   nodes and `AssessmentDetailSheet`; add a compact upcoming-assessments strip (date,
   name, open-detail) to CoursePath's header area so assessments are visible where
   they matter without opening CourseSettings.
4. **Naming cleanup.** With the `learn` nav item gone (§10.1) the id/label/route
   mismatch disappears; audit remaining user-facing copy so the words are "Study"
   (the act, from Dashboard/CoursePath) and "Session" (LearnMode) consistently.
5. **Analytics cross-links** (minor): the global Analytics page links each course in
   `CourseComparison` to `/course/:id/analytics`; CourseAnalytics links back via the
   new CourseTabs. No chart changes.

## 10.5 Explicitly out of scope

- **Splitting `LearnMode.tsx`** (3,564 lines, five session types, three chrome
  variants). Deliberately deferred — it is a refactor precondition for future study-UI
  work, not a user-facing fix, and deserves its own arc when study UI changes are next
  needed.
- Merging Analytics and CourseAnalytics into one system beyond §10.4's cross-links.
- Help-page interactivity (guided tours, interactive shortcut demos). Flagged as a
  promising later idea; needs its own scoping conversation first.
- Any change to session logic, scheduling, or the repository layer.

## 10.6 Task list

Each task is one subagent's scope, one commit, tests updated alongside.

1. **Dashboard absorbs StudyToday.** Study action on course cards, resume banner moved,
   `StudyToday.tsx`/test deleted, `/study` redirect shim, `DEFAULT_NAV_ITEMS` entry
   removed with the `readStored()` stale-id drop. Update `Dashboard.test.tsx`.
2. **`CourseTabs.tsx` + adoption.** The shared tab component, adopted on all four course
   surfaces; breadcrumb-row cleanup on CoursePath; `LessonViewModeToggle` relocation.
   Component test plus a route-active assertion.
3. **Editor back-links.** CardEditor/SequenceEditor return-to-origin behaviour (router
   state or referrer param — decide against existing navigation conventions in those
   files).
4. **Shared scrollspy rail.** Extract from `Settings.tsx` into
   `src/components/ui/SectionRail.tsx` (name indicative), with the mobile fallback;
   re-adopt in global Settings with zero behaviour change at `xl+`.
5. **CourseSettings regroup + instant commit.** §10.3's grouping and save-model
   conversion, adopting the shared rail. The largest task; `CourseSettings.test.tsx`
   updated to assert instant-commit semantics.
6. **Discoverability batch.** §10.4 items 1, 2 and 5 (palette affordance, Method/Help
   links, analytics cross-links).
7. **Assessments strip on CoursePath.** §10.4 item 3, reusing `AssessmentDetailSheet`.
8. **Documentation + end-to-end pass.** `SPEC.md`/`CHANGES.md`/Help copy updated
   (navigation descriptions, removed `/study` page, new tabs); manual walk of the
   restructured journey; this section's status line flipped per the Arc 1/2/3/4
   precedent.

## 10.7 Risks

- **Instant commit surprising existing users** (medium): a user used to "Save changes"
  may edit a scheduling number and back out expecting it discarded. Mitigated by
  commit-on-blur with validation, the existing undo patterns for destructive actions,
  and the change being called out in `CHANGES.md`; if a specific field proves
  dangerous, per-field confirm is a within-task decision.
- **Stored sidebar settings migration** (low): dropping unknown nav ids in
  `readStored()` must not clobber a stored order or visibility of surviving items —
  covered by a unit test on the merge logic.
- **Back-link state loss** (low): return-to-origin via router state fails on hard
  refresh; fall back to the course bank as the default origin.

## 10.8 Success criteria

1. `/study` no longer exists as a page; the Dashboard offers study, resume, and course
   browsing in one place, and nothing in the sidebar duplicates it.
2. Every course surface (path, bank, analytics, settings) is one click from every
   other via visible tabs.
3. CourseSettings has grouped sections, wayfinding on all viewport sizes, and exactly
   one save model with no pending-state ambiguity.
4. The command palette, Method page, and per-course assessments are each reachable from
   visible, persistent UI.
5. No behavioural change to sessions, scheduling, or data; all tests pass; `tsc -b`
   clean.

---

# Arc 11 — Item-Type Generalisation and Authored Mark Schemes (detailed)

> **Status: complete bar success criterion 3 (29 July 2026), which the first free-tier trial
> did not meet; the prompt and the batch parser were hardened in response and a re-run is
> owed.** Numeric and working payloads author, verify,
> machine-grade, back up, share, lineage-diff and merge through the same versioned
> `Card.payload`. The visual editor, batch staging path and MCP create/update tools share one
> compiler and validator. The verification engine now samples every multi-variable sign
> combination, widens sampling for domain-restricted expressions and distinguishes
> `equivalent`, `different` and `undetermined`. Checker disputes and marks provenance persist
> on review logs; unsupported payload kinds or versions render read-only and are rejected at
> the grading boundary. Optional course exam-board and specification provenance feeds batch
> prompts. The final browser pass covered hand authoring, fixtures, both study faces, an
> FSRS-backed dispute, the clipboard prompt/staging/revision boundary and a four-item share-code
> export/import. It used deterministic sample model output; no external chatbot was
> contacted, so model quality and free-tier latency remain unmeasured.

## 11.1 Motivation and positioning

Lacuna is a concept-testing application, not a flashcard application. A flashcard is one
delivery vehicle for a graded retrieval event; the FSRS engine only ever consumes graded
retrieval events and does not care what produced them. This arc generalises the vehicle
while leaving the engine untouched: alongside Basic/Reversed/Cloze presentation types and
the separate type-before-reveal setting, items may be structured practice questions —
numeric answers, scaffolded working, and free working chains marked against a tutor-authored
mark scheme. This is the arc that makes Lacuna
useful for exam-style practice (the Atom Learning-shaped use case) rather than recall
drill alone, and it is the prerequisite for mark-denominated readiness (§11.8) and for
mark-bearing receipts (Arc 12).

Prior art inside this repository: Appendix A.1's negative result stands as the recorded
reason this arc contains no learned marking. Verification here is deterministic
(equivalence by random evaluation, §11.4) or declarative (predicates, §11.5); the
LLM-marked path is explicitly out of scope (§11.10).

## 11.2 Data model: the additive payload

`Card` gains one optional field:

```ts
/** Per-type structured content for practice item types. Absent on every
 *  pre-Arc-11 card and on all three classic presentation types. Versioned independently of the
 *  DB schema so share codes and backups can validate forward-compatibly. */
payload?: ItemPayload;   // { v: 1; kind: 'numeric' | 'scaffold' | 'working'; ... }
```

Rules, in order of importance:

1. **No smuggling.** Structured content lives in `payload`, never encoded into `front`.
   The cloze trick (`{{cN::...}}` in `front`) was acceptable once; a working chain with
   waypoints, predicates and mark values crammed into Markdown is not. `front` remains
   the question prompt (Markdown, rendered as today) and doubles as the plain-text
   fallback rendering on clients that do not understand the payload.
2. **Additive everywhere.** No migration. Old cards never change; backups and v2 share
   codes carry `payload` opaquely where present. `LineageCardSnapshot` gains `payload` in
   its diffed field set (content, never FSRS state — same rule as today).
3. **`payload.v` from day one.** The mark-scheme grammar (§11.5) will grow; a version
   marker costs one byte now and prevents old clients silently mis-marking new schemes
   forever. Unknown `v` or `kind` renders the item read-only with the `front` fallback
   and an "update Lacuna to study this item" notice — never a crash, never a wrong mark.

Item kinds in this arc:

- **`numeric`** — machine-checkable answer: exact value, value-with-tolerance, or
  match-one-of. The Atom-style single question.
- **`scaffold` — deferred beyond Arc 11.** The discriminant remains reserved without an
  authoring or study surface. It remains the planned home for geometry proofs and wordier
  working: the teacher authors the full proof or method and holes selected steps, avoiding a
  pretend proof engine.
- **`working`** — free working chain: the student writes their own lines, marked against
  an authored scheme (§11.5) by the verification engine (§11.4).

The three kinds layer pedagogically: scaffold for learning a method, working for
drilling it, working-with-full-scheme for past-paper realism.

## 11.3 Maths input

Target user includes 11+ students. LaTeX is never shown or required.

- **Lenient plain-text parser as the base.** Accept what students naturally type
  (`2x+6=14`, `3/4`, `sqrt(16)`, `x^2`). Slice 1 adopted the number-only `mathjs/number`
  entry point behind a restricted validator, with a live rendered preview (KaTeX, shipped
  as `katex` and `rehype-katex`) so the student sees what the app understood. The 28 July
  production build placed it in the 648,459-byte minified / 187,658-byte gzip application
  chunk. A standalone bundle of `verify.ts` plus `mathjs/number` measured 153.75 KB minified
  and 43,571 bytes gzip; that is a dependency upper bound because it includes Lacuna's own
  verification code too.
- **Palette input on top.** Buttons for power, fraction, ×, ÷ and brackets insert templates
  into the text field, with 44px targets per the existing touch system. `sqrt()` remains
  typeable but does not get a slice-1 button; a structure-aware equation editor is explicitly
  out of scope.
- The input parser and the verification engine share one expression representation —
  this is a single investment, not two.

**Numeric-authoring follow-up — deferred beyond Arc 11:** make fraction entry cursor-aware
(or revisit a visual maths field) instead of requiring users to translate the structure
into slash notation themselves. Compact repeated “One of” rows so each alternative does
not duplicate a full preview and symbol palette. Extend numeric checking beyond constant
expressions so equivalent solution statements such as `x = 2`, `2 = x`, and whitespace
variants collapse to one accepted mathematical answer rather than requiring redundant
set-membership entries. For algebraic solutions, prefer structured answer templates such
as `x = [blank]` and an unordered pair of root blanks for quadratics. Decide explicitly
whether that belongs to the reserved scaffold kind or a multi-field numeric v2; do not
fake it by asking authors to enumerate equivalent equation spellings.
These linked interaction and answer-model changes need their own design pass.

## 11.4 Verification engine (pure module, no DB, no React)

`src/items/verify.ts` (name indicative), unit-tested standalone like `forwardSim.ts`:

- **Equivalence by random evaluation.** Two expressions are judged equivalent by
  substituting the same random values for free variables into both and comparing
  numerically, repeated over several draws. Deterministic seeding per (item, attempt) so
  a verdict is reproducible in dispute review. Not symbolically airtight; with
  real-valued draws the collision probability is negligible, and the failure mode is
  caught by the feedback loop (§11.7). This is what makes free working chains checkable
  fully offline with no CAS dependency.
- **Waypoint semantics.** A scheme line defines a checkpoint value, not a required
  surface form: any student line equivalent to the waypoint earns its mark, and matching
  is order-tolerant (each student line is tested against outstanding waypoints) rather
  than lockstep. "Pass through these waypoints" is how method marks behave; "match my
  working" is not.
- **Numeric checks.** Exact, tolerance (`within`), and set membership, for `numeric`
  kinds and final-answer lines.

## 11.5 Mark-scheme syntax and compiler

Tutor-authored, in the editor, as text — data, never executable code (imported decks must
never run a stranger's logic; there is no sandbox and there will not be one). Indicative
shape:

```
[1] substitution :: 2x = 8
[1] solve        :: x = 4
[1] check        :: within 0.01 :: 4.0
```

Mark value in brackets, optional criterion label (free short string — powers the
per-criterion analytics in §11.8 with zero ontology work), then either a waypoint
expression (equivalence-checked) or a predicate. Predicate vocabulary v1: `equals`,
`within`, `matches-one-of`, `contains` (case-normalised substring, for "states the
formula"-style science marks). The vocabulary is expected to grow from real tutor
complaints, not armchair design — hence `payload.v`.

**Compiler requirements** (this is a product surface, not a parser):

- Error-tolerant: one malformed line never blanks the preview; other lines keep
  compiling, the broken one gets an inline squiggle and a human-voiced message
  ("I don't recognise 'wthin' — did you mean 'within'?").
- Live compiled preview beside the source (the cloze-preview pattern scaled up): each
  waypoint rendered in plain English ("1 mark — substitution — any line equivalent to
  2x = 8") with a running mark total. The plain-English rendering is the mechanism that
  teaches the syntax without documentation.
- Autocomplete on `[` and predicate names.
- One grammar, one compiler, exposed as a pure module: the editor, the import staging
  area (§11.6), and the MCP boundary all funnel through it, so tutor typos, LLM
  hallucinations and agent mistakes all fail the same visible way.

## 11.6 Test harness, fixtures, and the LLM authoring pipeline

**Test harness.** A third editor panel where the tutor types a pretend student answer and
watches the scheme mark it live — waypoints lighting up, marks tallying, misses explained
("no line equivalent to x = 4 found"). Over-strict predicates are the failure mode that
silently punishes students weeks later; this is the only place they are catchable early.

**Fixtures.** Sample answers (correct routes and classic wrong ones, each with an
expected score) can be pinned to the item and re-run automatically on every scheme edit —
regression tests for mark schemes. Fixtures travel in the payload so a shared item
carries its own tests.

**LLM pipeline** (paste loop; no API keys, no hosted endpoint — the realistic student
and tutor sits on free-tier ChatGPT, and ChatGPT's custom-connector path is Plus-only
and remote-server-only, so MCP is the power-user path, not the default):

Generated output in this slice is scheduled concept material, not an ephemeral worksheet.
Working questions should retrieve a general method, relationship or derivation from the notes:
derive the quadratic formula or complete the square symbolically, rather than minting cards for
arbitrary coefficient sets. Parameterised numerical practice belongs to §11.12's future generated
instances, where variants share one scheduled template identity.

1. **Scheme-from-question:** "Draft mark scheme" copies a clipboard prompt containing
   the question, the full syntax specification with worked examples, and the predicate
   vocabulary. The tutor pastes into their chatbot, pastes the reply back into the
   scheme pane, and the compiler validates it instantly — the compiler is what makes
   LLM generation trustworthy.
2. **Batch generation (the real workflow):** notes → wizard ("paste your notes for this
   lesson", topic + level, with optional manual concept-density and maximum-item constraints)
   → clipboard prompt that additionally
   instructs the model to ask up to three clarifying questions before producing output
   (the follow-up conversation happens entirely in the chat window; Lacuna never
   mediates it) → one structured, delimited output block containing items, schemes and
   fixtures → paste back into a **staging area**, never directly into a lesson.
   By default the model chooses concept density and the useful item count; populated manual
   constraints are injected independently. Chunk by lesson/topic rather than adding a hidden
   application cap or padding later items into mush.
3. **Staging/triage view** (the `PendingMergeReview` pattern wearing a different hat):
   each proposed item shows compile status, fixture status, and duplicate status
   (`diff_import_preview`'s duplicate detection run against the target lesson, so
   "this looks like an item you already have" surfaces at triage, not after
   distribution). Per-item accept/edit/reject; "accept all clean" as the bulk action.
   Malformed item 23 shows red; the other thirty-nine import.
4. **Revise-with-AI:** from any staged or accepted item, one button copies the item, its
   scheme, its failing fixture and a complaint field into a fresh clipboard prompt.
   Without this, round two means hand-reconstructing context, and tutors will ship it
   broken instead.
5. **MCP direct** (Arc 2 surface): `lacuna.create_card` grows a payload variant,
   validated at the tool boundary by the same compiler. No new UI.

**Source-file ingestion — deferred beyond Arc 11.** The batch-authoring notes field currently
accepts only pasted text. DOCX/PPTX/image/OCR ingestion is substantial product and security scope
of its own. A later implementation should add a file picker and drop target for `.md`, `.txt`,
`.docx`, `.pptx` and common image formats, locally rather than uploading source material to a
Lacuna server, and extend the existing import and asset systems instead of creating another file
pipeline:

- extract DOCX paragraphs, headings, tables and embedded images in document order;
- extract PPTX slide titles, body text, speaker notes and embedded images in slide order;
- reuse the existing content-hashed `ImageAsset` store for extracted and directly uploaded
  images, with optional on-device OCR only after its bundle size and accuracy are measured;
- show an extraction preview split into named sections, images and warnings before anything
  enters a prompt, so a broken table or image-only slide is visible rather than silently lost;
- keep original files transient by default. A plain-text clipboard prompt cannot transfer
  binary attachments, so copy explicit attachment names/instructions and let the tutor attach
  the originals or exported images in their chosen chatbot;
- validate MIME signatures as well as extensions, cap decompressed OOXML size and image count,
  reject encrypted/password-protected Office files clearly, and never execute macros or active
  document content;
- treat unsupported file types as an explicit parser gap. An indiscriminate “upload any file”
  control that then guesses at bytes is not support.

Success requires fixtures made from real DOCX/PPTX samples covering headings, tables, speaker
notes, reordered slides and embedded images, plus a browser test proving that extraction stays
on-device and that cancelling the preview stores nothing.

Downstream of triage, everything already exists: accepted items join the lesson, Publish
bumps the revision, students merge through Arc 7 with FSRS state preserved. The pipeline
is shippable on share codes alone, before Arc 12 exists.

## 11.7 Grading, feedback, and disputes

- **Grade mapping.** One graded retrieval event per item (see §11.9 for the open
  alternative). Fraction of marks earned plus response time maps onto the four-point
  scale: full marks and fast → Easy; full marks → Good; partial with self-corrected
  errors → Hard; collapsed → Again. Exact thresholds live in one pure function beside
  `grading.ts` and are tunable.
- **`ReviewLog` additions** (optional fields, no migration): marks earned/available and
  the per-line verification verdicts, so the checker's behaviour is auditable and the
  §11.8 analytics need no second bookkeeping.
- **Checker feedback.** Every verified line carries a "the checker got this wrong"
  affordance, logging question, student line, verdict and the random draws used.
  Disputes surface in the author's marking queue (Arc 12) as a proposed new fixture —
  the dispute becomes the test case.
- **Author-marked queue (Arc 12 slice).** Items the checker cannot verify can be queued
  for the tutor to mark against the scheme; scheduling proceeds on a provisional Good
  pending correction so the queue never blocks study. Student-facing self-marking does
  not exist as a concept.

## 11.8 Marks-denominated readiness and provenance

- **Marks-denominated readiness UI — deferred beyond Arc 11.** `aggregateMarkPerformance`
  and `aggregateCriterionPerformance` are fully tested but deliberately have no production
  callers: they summarise retrospective `ReviewLog` attainment. The promised forward-looking
  Σ(marks × predicted exam-day R) depends on a future exam-realistic practice mode; ordinary
  learn-mode marks are not the sample to forecast from.
- The retained criterion labels and pure aggregators preserve the data seam for later
  diagnoses such as "drops the substitution mark 70% of the time" without creating an
  ontology now.
- **Provenance, deliberately thin:** `Course` has optional `examBoard` and
  `specification` plain strings (data-only; edited in Course Settings, feeds the batch LLM
  prompt context and labels
  receipts). Spec-point tagging rides the existing tags system as a convention
  (`spec:3.4.1`). A first-class Specification entity (board → topic tree → spec points)
  is explicitly refused: it is the LMS trap, it makes Lacuna a curator of other people's
  revisable taxonomies, and the tag convention retains the migration path if per-spec
  dashboards ever become the core pitch.

## 11.9 Resolved slice-1 decisions and remaining questions

1. **One FSRS event per item.** A working chain produces one graded retrieval event. Its
   criterion verdicts and marks remain audit data on that event; they do not acquire separate
   memory states.
2. **Predicate vocabulary remains deliberately small.** v1 ships `equals`, `within`,
   `matches-one-of` and `contains`; further predicates must be earned from real tutor failures.
3. **11+ palette scope is settled for slice 1.** Power, fraction, multiply, divide and
   brackets are visible aliases over the plain-text syntax. Root remains typeable as `sqrt()`;
   π and trigonometric controls wait for a demonstrated GCSE need. Fraction entry itself still
   needs the cursor-aware follow-up in §11.3.
4. **Numeric and working items use dedicated machine-marked faces.** Typing is not a card
   type: it is a presentation preference layered over Basic/Reversed/Cloze and retains
   self-grading. Reusing it for authoritative numeric marks would conflate two grading models.
   The dedicated faces reuse the shared maths input instead.

5. **Line matching remains greedy; optimal bipartite matching is deferred beyond Arc 11.**
   `verifyWorkingLines` walks the
   outstanding scheme lines in order and takes the first match, so a student line that satisfies
   both a generic 1-mark line and a specific 2-mark line consumes whichever appears earlier in the
   scheme. A later student line whose only match has just been consumed then scores nothing.
   The error is always underscoring, never overscoring. Schemes are small enough that optimal
   maximum-weight bipartite matching would cost nothing to run; it is deferred because it changes
   marks for existing schemes and needs its own regression corpus first. Revisit when a real
   scheme demonstrates the collision rather than on principle.

6. **A tuple answer kind is deferred beyond Arc 11, and is the first thing criterion 3 earned.**
   The manual free-tier trial (29 July 2026, simultaneous equations) returned nine well-formed
   items of which three validated. Six failed on one cause: the model expressed a two-variable
   solution as a single answer, `x=6,y=4`. Both boundaries reject it correctly and for the same
   underlying reason — `numericAnswerSpecIsValid` requires a constant expression with no
   variables, and an `equals` criterion permits at most one `=`. Splitting into one criterion per
   variable (`[1] x :: equals :: 6`, `[1] y :: equals :: 4`) compiles and earns full marks, so
   the content was always authorable; the prompt simply never stated the constraint. The prompt
   now does (§11.6), which is the whole fix for now.

   The open question is whether v1's one-value-per-answer model should acquire a first-class
   ordered or named tuple — a coordinate pair, a solution set, a quantity with a unit — so that
   "solve for x and y" is one criterion instead of two. Arguments for: it is the natural answer
   shape for simultaneous equations, intersections and vectors, all of which are core GCSE
   content, and splitting silently changes a 2-mark question into a 3-mark one. Arguments
   against: §11.10 holds that predicates are earned from real tutor failures, and this is one
   trial on one topic; a tuple also raises ordering, partial-credit and equivalence questions
   (is `y=4,x=6` the same answer? does half a tuple earn half a mark?) that the current
   single-value model does not have to answer. Settle those before building, and treat the
   splitting workaround as the supported path meanwhile.

## 11.10 Explicitly out of scope

- LLM-graded free text as a scheduling input (A.1's negative result; an optional
  "check my working" affordance may exist later but never feeds FSRS).
- Learned/ML marking of any kind.
- Executable teacher verification logic or any sandbox.
- A geometry/proof formal syntax; the reserved scaffold kind remains the planned home for
  geometry proofs and wordier working in a later arc.
- A structure-aware equation editor.
- First-class exam-board/specification entities (§11.8).

## 11.11 Success criteria

1. Both delivered item kinds author, verify, grade, share (v2 codes), back up, lineage-diff
   and merge round-trip, with pre-Arc-11 clients — which have no `payload` field and no
   `UnknownItemFace` — silently dropping the unknown `p` key on import and self-grading
   the resulting front_back card against its (empty) back.
2. The compiler round-trips every fixture in its own test corpus; the editor preview,
   staging area and MCP boundary all reject the same malformed inputs identically.
3. A tutor can go notes → batch prompt → paste → triage → publish inside ten minutes
   for a typical lesson, on free-tier ChatGPT, with no API key. **Attempted 29 July 2026 and
   not met on the first pass.** The response was rejected outright because the model closed the
   block by mirroring `<<<LACUNA_ITEMS_V1>>>` instead of copying `<<<END_LACUNA_ITEMS_V1>>>`;
   with the delimiter corrected by hand, three of its nine items validated (see §11.9.6 for the
   cause of the other six, and note that two of the three that passed were weak items a tutor
   would discard). The parser now accepts a mirrored closing delimiter and the prompt now states
   the one-value-per-answer rule.

   A second trial the same day, on a deliberately weak model (GPT-5.5 mini, no thinking),
   returned eight items of which six validated. Both fixes held: the model mirrored the closing
   delimiter again and the block parsed anyway, and no answer came back as a tuple. The two
   failures shared one cause — an `equals` fixture written `y = 3` rather than `3` — which turned
   out to be a verifier gap rather than an authoring one, since the study face runs the same
   check and a student writing `y = 3` lost the mark too. With that fixed the batch validates
   8/8 unedited. Criterion 3 stays open until a run clears it end to end, including the tutor
   actually publishing inside ten minutes, which neither trial measured.
4. Verification is fully offline; no item type introduces a network dependency into the
   study loop. All tests pass; `tsc -b` clean.

## 11.12 Long-term direction: skill-linked item families and generated practice

**Deferred beyond Arc 11.** The fixed `Card` remains the implementation and scheduling unit
for this arc. Do not smuggle the model below into the slice-1 payload or delay the current
numeric/working release for it.

Recall cards and practice questions are different observations of related knowledge, not
interchangeable reviews of one card. For example, “state the quadratic formula”, “recognise
when to use it”, “solve a quadratic with it”, and “interpret the discriminant” all belong to
one curriculum skill while testing distinct capabilities. The long-term model is therefore:

```
Skill / concept
  -> one or more item templates
  -> zero or more generated review instances per template
  -> separate memory state per template
  -> aggregate skill readiness derived from the template evidence
```

Rules:

1. **Link items through a skill, never by making one card own another.** A recall item and a
   practice template are siblings under a stable skill id. This keeps curriculum grouping
   separate from card rendering and avoids a fragile chain of “concept card plus attached
   questions”.
2. **Do not double-apply reviews.** Solving an application question is not a literal review
   of an unseen formula card, so it must not write an FSRS event into that card's history.
   Each item template retains its own memory trace. Skill readiness is a derived summary,
   not a second FSRS state updated as though the learner answered another prompt.
3. **Evidence is directional.** Successful application is some evidence for prerequisite
   recall; successful recall is weak evidence for application. Failures may increase the
   priority of relevant prerequisite items, but any cross-item scheduling influence must be
   conservative, auditable and learned from outcomes rather than encoded as symmetrical
   score sharing.
4. **Recall prompts are optional views, not mandatory anchors.** A skill may retain a hidden
   or disabled direct-recall template while its practice templates remain active. This covers
   concepts whose definition card adds nothing without deleting the curriculum identity or
   its history.
5. **Generated instances share one scheduled identity.** A parameterised quadratic template
   can present different valid coefficients on each attempt, but those instances update the
   template's memory state rather than becoming dozens of fake independent concepts. Store
   the template version, deterministic seed, generated parameters, rendered question and
   verdict on the attempt so disputes and receipts remain reproducible.
6. **Generation is declarative and validated.** A future template format may define typed
   variables, domains, exclusions, constraints, derived expressions, prompt interpolation,
   answer specifications, units, tolerances and mark schemes. Imported teacher content must
   remain data, never arbitrary JavaScript or Python. A general-purpose code sandbox is still
   refused; “the author is an experienced programmer” does not make executing distributed
   course code safe.
7. **LLMs draft templates; Lacuna proves them.** The LLM or a programmer may author the same
   declarative format. Before acceptance, Lacuna generates a deterministic corpus across edge
   cases and verifies that every instance compiles, has a valid answer, passes its fixtures and
   does not produce forbidden or ambiguous values. Generation failure blocks publication just
   like a malformed mark scheme.
8. **Start where validation is strong.** Arithmetic, algebra and formula-driven physics,
   chemistry and accounting are plausible first targets. Open-ended prose, proofs and diagrams
   do not become “programmatically validatable” merely because an LLM emitted JSON; they remain
   on scaffolded, predicate or author-marked paths until a deterministic verifier exists.

The product-level generation choice should eventually be explicit: recall cards, practice
questions, a balanced progression, or model-selected. A balanced lesson should normally move
from recall to method recognition to application to extended practice, while refusing padded
sets of near-identical numerical questions that measure memory of wording rather than transfer.

Before implementation, settle skill granularity, prerequisite representation, cross-item
evidence weights, template versioning and distribution, instance-history retention, and the
minimum generated corpus needed to reject ambiguous parameter spaces. None of those decisions
is implied by Arc 11's existing `Card.payload`.

---

# Arc 12 — Progress Receipts and Encrypted Relay (detailed outline)

## 12.1 Motivation

The tutor/teacher story (authoring and distribution) shipped with Arcs 2 and 7. What is
missing is the return path: evidence of how a student is actually tracking against the
exam, without a Lacuna-run cloud and without violating local-first. The audience is the
tutor preparing next session ("what decayed since last week?") and the parent paying for
tutoring ("is this working?") — predicted exam-day readiness is a number no gradebook or
tutoring platform provides, because none of them model memory.

## 12.2 Receipts (no infrastructure; first slice)

A **progress receipt** is a compact, share-code-style artefact the *student* generates
and sends over any existing channel (email, WhatsApp); the author pastes it into their
copy. Data moves only when a human deliberately moves it — that is the consent model,
and it keeps the no-cloud tag honest.

- **Contents:** course/lineage id, per-lesson (and, post-Arc 11, per-criterion)
  aggregates of predicted exam-day retrievability, predicted marks (§11.8), review
  counts, generated-at. Coarse by design: no card content, no per-review timestamps.
  Hundreds of bytes before DEFLATE.
- **Format:** own prefix (`LACR`-style), versioned, reusing the share-code
  encode/decode/compression machinery. Receipts are not share codes and never carry
  scheduling state inward.
- **Reader UI:** in the author-side surface, receipts aggregate per student per course —
  readiness trend over time, weakest topics first ("solid on trig identities,
  haemorrhaging circle theorems from a month ago"), so the paid hour goes on repair
  rather than guesswork.

## 12.3 Relay (optional transport; second slice)

At more than a handful of students, manual pasting is farce. The answer that preserves
the identity: a **self-hostable, end-to-end-encrypted blob relay** — dumb by design, so
hosting it is legally and morally boring.

- **Server:** one small binary (or container), three endpoints (put/get/delete), storing
  opaque ciphertext only. Channel id = random 128-bit string (unguessable = read access
  control); writes require a bearer token minted at channel creation; size cap per blob;
  TTL refreshed on write so abandoned channels self-clean. SQLite or flat files;
  free-tier-VM sized. MIT, shipped in-repo; anyone can host one, Lacuna-the-project
  runs nothing.
- **Encryption:** client-side, key carried in the URL fragment of whatever the student
  shares (WhatsApp-style trust model); the server never sees a key or a plaintext byte.
- **`RelayProvider` seam in the app:** transport is pluggable — manual paste (default,
  always available, the degraded mode that protects the no-cloud claim), self-hosted
  relay URL from settings. Receipts, published lineage updates (Arc 7 codes get
  automatic delivery), and the author-marked queue (§11.7) are just channel payloads.
  Arc 8 option 4 reuses the identical relay for device sync, which is the argument for
  building the relay here first: it delivers tutor value immediately while the genuinely
  hard multi-device merge question stays a design doc.

## 12.4 Open questions

1. Receipt cadence and prompting on the student side (manual only, or a gentle
   "send your weekly receipt?" nudge — mindful of the no-gamification line).
2. Whether the author-side reader lives in the current shell or waits for the Arc 10
   follow-on role split (author/student surface separation) — see cross-arc notes.
3. Marking-queue payload shape (working chains need student lines + draws for
   reproducible verdicts; bigger than a receipt, still small).
4. Relay abuse posture for a publicly hosted instance (rate limits, blob caps) —
   irrelevant for self-hosters, required before anyone hosts a communal one.

## 12.5 Success criteria (for the receipts slice)

1. A student can produce a receipt in two taps; an author can paste it and see the
   trend/weakness view with no configuration.
2. Receipts contain no card content and nothing finer than per-topic aggregates;
   the format is versioned and documented.
3. Everything works with no relay configured; a self-hosted relay is configuration,
   never a requirement.

---

# Arc 13 — Codebase Consolidation and Release Verification (detailed outline)

## 13.1 Positioning and constraints

This is the final cleanup arc after the planned feature work, not a pretext for pausing every
release until the codebase achieves imaginary perfection. Its purpose is to remove accumulated
branch-era duplication, make the remaining architecture legible, eliminate noisy tests and builds,
and prove the finished web product manually. Behaviour changes found during the audit are fixed in
separate commits with regression tests; cleanup commits do not quietly change product semantics.

The arc begins from a green build and preserves that state after every reviewable slice. Avoid a
single repository-wide rewrite: it would maximise conflict risk while making regressions almost
impossible to attribute. Prefer deletion, extraction and convergence on existing systems. A large
module is not automatically bad, and a small wrapper is not automatically architecture.

## 13.2 Inventory before deletion

1. Record production bundle/chunk sizes, test count and duration, lint warnings and TypeScript build
   time as the baseline. Improvements are measured against this record rather than claimed from
   vibes.
2. Inventory routes, exported symbols, dependencies, storage adapters, import/export paths, modal
   patterns and scheduling entry points. Confirm apparent dead code through references, dynamic
   imports, persisted-data compatibility and Electron entry points before removing it.
3. Classify findings as duplicate implementation, obsolete compatibility path, oversized mixed-
   concern module, harmless repetition, or deliberate platform boundary. Only the first three are
   candidates for change.
4. Keep schema readers and migration compatibility until the oldest supported backup/share formats
   no longer require them. “Nothing imports this function today” is not sufficient evidence when
   old persisted data calls the path indirectly.

## 13.3 Consolidation slices

- **Session engine:** split `useLearnSession` only at state-machine or persistence seams that can be
  tested independently. Do not scatter one difficult flow across a dozen context wrappers merely to
  make the line count look civilised.
- **Repository and lineage merging:** extract cohesive persistence concerns from the large repository
  and merge-import modules; share validation and snapshot helpers instead of maintaining near-copies.
- **Authoring and import surfaces:** audit repeated editor state, validation, modal and preview logic.
  Numeric, working, batch staging, visual import and MCP writes must continue to converge on the same
  compiler/validator rather than acquiring convenient second implementations.
- **UI primitives:** remove locally reimplemented confirmation, select, section-navigation, overlay,
  toast and responsive-control patterns where the existing shared primitive already fits. Do not
  force genuinely different interactions through a swollen universal component.
- **Dependencies and assets:** remove unused packages and duplicate asset paths, verify lazy-route
  boundaries, and resolve the current mixed static/dynamic import warnings where doing so changes an
  actual chunk boundary. Record unavoidable large chunks rather than hiding warnings with a larger
  threshold.
- **Documentation:** delete superseded instructions, make `README.md`, `SPEC.md`, `CHANGES.md` and the
  roadmap agree, and retain explicit deferred-feature boundaries so cleanup does not make planned
  work appear shipped.

Each slice gets a focused PR and must reduce or preserve code volume unless added regression tests
or compatibility adapters justify growth. Mechanical formatting is kept separate from semantic
changes; otherwise review becomes an expensive game of spot-the-one-real-line.

## 13.4 Test and diagnostic hygiene

1. Remove every ESLint warning or document the narrow rule exception beside the code. The current
   eight-warning baseline is debt, not a target.
2. Eliminate React `act()` warnings, zero-sized chart noise, intentional iframe-network abort noise
   and other unsolicited test output. Expected failures are asserted or mocked explicitly; a green
   suite that screams for forty seconds trains reviewers to ignore the one warning that matters.
3. Add regression coverage before deleting duplicate or compatibility code. Tests should assert the
   public behaviour, not freeze the implementation being removed.
4. Keep the full web and Electron type-check, unit/component suite, production build and PWA output as
   required CI gates. Add no blanket snapshot suite and no percentage target that rewards testing
   getters while missing scheduling and data-loss risks.
5. Audit slow and flaky tests separately. Use fake clocks and deterministic data where appropriate;
   do not lengthen timeouts until intermittent failures become intermittent for longer.

## 13.5 Full browser verification

Execute `docs/WEBSITE_TEST_CHECKLIST.md` against the production preview after consolidation, not only
the development server. The checklist is the release record and must be committed with release,
browser, operating-system, viewport and tester metadata plus issue links for every failure.

Required matrices:

- fresh profile, upgraded existing profile and restored-backup profile;
- desktop and mobile viewport, keyboard and touch interaction;
- light and dark themes, all application motion speeds and operating-system reduced motion;
- first run, every routed surface, authoring, lesson/Simple study, FSRS Practice, numeric/working
  marking, revision planning, sharing/lineage updates, imports, full backup restoration and offline
  reload;
- permission-dependent PWA install, persistent storage, camera scanning, full screen and folder
  access where the browser/platform supports them;
- Electron MCP and updater verification remains a separate desktop record and is never marked as a
  website failure.

Failed checks block the arc only when they are reproducible product defects, data-loss/privacy risks,
accessibility failures on a primary path, or contradictions with documented behaviour. Platform
limitations and deliberately deferred features are recorded, not “fixed” by pretending support.

## 13.6 Success criteria

1. No confirmed dead or duplicate production path remains without a written compatibility reason;
   oversized mixed-concern modules are split at tested seams or retain an explicit justification.
2. TypeScript, ESLint, the full test suite and production/PWA builds pass with no unsolicited warning
   noise; any unavoidable bundler warning is measured and documented.
3. Bundle and test baselines are recorded before and after the arc, with regressions explained.
4. All 254 current website checklist entries, plus any entries added by later arcs, are executed on
   the final production candidate. Every failure is fixed or linked to an explicit release decision.
5. A full backup produced before the pass restores successfully afterwards; no cleanup invalidates
   supported backups, share codes, lineage updates, review history or FSRS state.
6. The final documentation describes the code and product that actually ship. Arc 13 then closes;
   it does not become a permanent bucket named “miscellaneous cleanup”.

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
  independent of each other and of Arc 8. Arc 10 (UI de-clutter) is independent of
  Arcs 6–9 and touches only navigation/layout, so it may run before any of them; its
  one deliberate deferral (splitting `LearnMode.tsx`) was completed before Arc 11 touched
  study-session UI. Arc 11's numeric/working slice is delivered; scaffold and the recorded
  authoring-input follow-ups remain. Arc 12's receipts slice depends on Arc 11 only
  for mark-denominated figures (a retrievability-only receipt could ship independently),
  and its relay slice is deliberately shared infrastructure with Arc 8 option 4. Arc 13 follows
  the feature arcs as a bounded consolidation and release-verification pass; it is not a reason to
  defer ordinary maintenance or regression tests until the end of the roadmap.
- **Arc 10 follow-on (role split, not yet an arc):** the de-clutter should anticipate a
  future author/student surface separation — one engine, two shells (study surfaces vs
  authoring/publish/triage surfaces), promoted from the existing `lessonViewMode`/
  `canEditLessons` gate to an app-level identity. Arc 10 decisions that pre-commit both
  roles to one navigation structure should be flagged rather than baked in.
- Each arc gets its own detailed plan (or addendum here) before implementation begins;
  outline sections above are scope agreements, not specifications.

---

# Appendix — Experimental Prototypes (not committed roadmap arcs)

Work in this section is exploratory: it has no arc number, no integration commitment, and
no place in the ordering notes above. It exists so a prototype has a written plan without
pretending to be a scoped feature. Promotion to a numbered arc (with its own integration
plan) is a separate, later decision made only if the prototype's results justify it.

## A.1 Local semantic typed-answer matching (prototype)

> **Status: complete (17 July 2026). Negative result — not promoted to an arc.** The
> approach does not work and should not ship; see **Results** at the end of this section
> for the numbers and the reason. The exploratory goal was met: we now know how a small
> classifier over frozen sentence embeddings behaves on this problem, which was the stated
> success condition rather than a shipped feature. `src/utils/answerComparison.ts` and
> `src/state/answerStrictness.ts` were not touched, as scoped. The plan below is preserved
> as written for the record; where the implementation deliberately diverged from it, the
> Results section says so.

**Motivation.** `compareAnswer()` (`src/utils/answerComparison.ts`) does positional,
word-by-word string matching with optional case/punctuation normalisation
(`src/state/answerStrictness.ts`'s lenient/standard/exact levels). It has no tolerance for
a correct paraphrase or synonym — typed mode (`src/state/typingSetting.ts`) exists
specifically so learners can't fudge self-grading the way silent reveal-mode allows (see
prior discussion, not otherwise recorded in this document), so over-tolerant matching would
defeat the point; but under-tolerant matching punishes answers that are actually correct.
This prototype explores whether a small model trained on frozen sentence embeddings can
classify typed-vs-expected pairs as match/no-match more usefully than string comparison,
as a first step towards a possible future `semantic` strictness tier — not committed here.

**Structure.** Mirrors the existing `tooling/short-term-memory/` precedent (the
half-life-logistic memory model: `src/fsrs/halfLifeLogisticModel.ts`,
`tooling/short-term-memory/`) rather than inventing new conventions:

```
tooling/semantic-answer-match/
  pyproject.toml          # uv-managed, same pattern as short-term-memory
  data/raw/                # user-supplied source term/answer pairs (see Step 1)
  data/synthetic/          # generated pairs; gitignored, regenerable, not committed
  match_harness/           # data generation, feature extraction, training, evaluation
  reports/                 # evaluation output
  README.md                # what it is, how to run it, flagged as exploratory/unshipped
```

**Step 1 — Source data.** Decided: not the prompter's GCSE vocabulary lists after all — a
vocab-only corpus can't cover the subject range this is meant to generalise across (Lane A:
short, canonical-answer near-miss matching, across subjects, not open-ended essay
automarking — see chat discussion). Source examples (a prompt/term, its correct answer, and
plausible wrong answers) are instead generated with the prompter's existing ChatGPT
subscription rather than the API — the subscription already covers this at no marginal
cost, and API pricing is irrelevant here as a result. **Model: GPT-5.6 Luna, low thinking
effort.** Luna is OpenAI's cheapest/fastest GPT-5.6-generation tier, explicitly positioned
for high-volume, classification-adjacent generation work — a closer match to "produce
thousands of short structured examples" than GPT-5.4 mini's coding/agentic/tool-use
positioning, and being the newer generation its capability at this task is expected to be
at or above the previous generation's mini tier despite the lower cost. This is a judgement
call from published positioning, not a benchmark run on this exact task — spot-check a
small batch before committing to a full run, and switch tier (Sol/Terra) or generation
(5.4 mini) if quality disappoints; switching costs nothing but which chat window gets
pasted into. Using a hosted model for this offline, one-off data-generation step does not
compromise the app's local-first/no-cloud principle — that principle governs what the
shipped app calls at runtime, not how a training corpus gets built on the prompter's own
machine before anything is frozen into it.

**Step 2 — Synthetic pair generation.** Generation is manual (a subscription chat session,
not a scripted API call), so `match_harness`'s job on this side is validating and cleaning
what gets pasted in, not calling a generator: ask for a fixed, modest batch per message
(recommend 30–50; larger single-completion requests risk repetition and quality drift
towards the end) in a strict delimited format (e.g. one JSON object per line), and parse,
deduplicate and schema-check each pasted batch from `data/raw/llm_batches/*.jsonl` before
it's used. Iterate across separate messages/threads to build up subject and topic coverage.

For each source example, generate:
- **Positive pairs (match):** the exact expected answer; case/punctuation noise and
  word-order shuffles (deterministic, handled in `match_harness` — no need to spend a
  message on these); genuine paraphrase/synonym substitution (worth a model call — a real
  paraphrase needs actual understanding of the term, which generic synonym-list
  substitution can't reliably do for subject-specific vocabulary).
- **Negative pairs (no-match):** the highest-value use of the model, not an afterthought —
  ask directly for plausible *wrong* answers per subject (a common misconception, a
  related-but-distinct term, a confusable concept), rather than pairing with a random other
  item's answer. A model that understands the subject produces far more realistic hard
  negatives than mechanical corruption does, and hard negatives are what actually shapes a
  classifier's decision boundary.

Target size is a few thousand pairs — enough for a classifier this small. **Open item:**
subject/topic coverage isn't decided yet; absent other direction, default to a broad
GCSE-style spread across sciences, humanities and languages, since "all subjects" is the
stated eventual ambition.

**Step 3 — Feature extraction & model.** Frozen pretrained sentence embeddings
(`sentence-transformers/all-MiniLM-L6-v2`, ~90MB, CPU-only) as a fixed feature extractor —
its weights are not fine-tuned; that would cost meaningfully more compute and memory for no
expected benefit at this data scale. Per pair, compute: cosine similarity between typed and
expected embeddings, normalised edit distance, and token-overlap ratio, concatenated into a
small feature vector. Train a small classifier head (scikit-learn logistic regression or a
two-layer MLP) on these features against the match/no-match label. This is well within an
8GB unified-memory machine: nothing here trains or loads a full transformer's gradients,
only inference through a frozen ~90MB model plus a classifier with a few hundred parameters.
Save the trained head with `joblib`/pickle — no need to design a frozen JSON coefficient
schema (`halfLifeLogisticModel.ts`'s pattern) unless and until this becomes an integration
candidate.

**Step 4 — Evaluation.**
- Train/validation split (e.g. 80/20) on the synthetic pairs; report accuracy and,
  specifically, precision/recall on the negative class — a false "match" is worse than a
  false "no-match" here, since silently accepting a wrong answer is a worse failure mode
  than the current behaviour of over-rejecting a valid paraphrase.
- Run the current `compareAnswer()` lenient-mode logic over the same pairs as a baseline,
  so the comparison is a concrete before/after number, not a vibe.
- Hand-write a small held-out set of genuinely tricky paraphrase cases — not generated by
  the same synthetic pipeline — and check the model against those specifically. This is the
  one part of evaluation that must not be synthetic: a generator can only test its own
  assumptions about what a paraphrase looks like, so the only honest read on whether this
  generalises is a handful of real, manually-judged cases.

**Explicitly out of scope for this pass:**
- Any change to `src/utils/answerComparison.ts` or `src/state/answerStrictness.ts`.
- Fine-tuning the embedding model's own weights.
- Sourcing real (non-synthetic) typed-answer data — none exists; the app has no telemetry,
  by design (local-first, no cloud component).
- Deciding how a trained model would ship at runtime if this is ever integrated (in-browser
  ONNX/WASM inference, bundle size budget, Electron-only vs PWA-compatible, etc.) — a real
  question for a later, separate plan, not this exercise.

**Results (17 July 2026).**

Built and run in `tooling/semantic-answer-match/` (commits `43e21b3`, `3428f3c`, `f3d4496`,
`61b50b6`, `0ae326a`, `1066d8a`, `94ccaa7`). 685 source records were generated across
Biology, Chemistry, Physics, History, Geography, English Literature, French and Religious
Studies, expanding to 5,131 labelled pairs. Every batch validated with zero schema errors.

*The finding, in one line:* cosine similarity measures whether two answers are **related**;
marking requires knowing whether they are **equivalent**. Those two agree everywhere except
on plausible near-misses — which is exactly the population that matters. The feature set
(cosine similarity, normalised edit distance, token overlap) cannot represent contradiction,
so negation, reversed cause and effect, and substituted entities are invisible to it. A
wrong answer that is *nearly* right sits in the same region of feature space as a correct
paraphrase, and no threshold separates them.

*The numbers*, on a deterministic stratified 80/20 split (`reports/evaluation.json`):

| | Accuracy | Neg. precision | Neg. recall |
| --- | --- | --- | --- |
| Classifier | 0.793 | 0.696 | 0.670 |
| `compareAnswer()` lenient baseline | 0.728 | 0.551 | **0.997** |

The baseline almost never accepts a wrong answer; its weakness is rejecting genuine
paraphrases. The classifier buys paraphrase tolerance at the cost of accepting roughly a
third of wrong answers — a regression on the asymmetry Step 4 names as decisive.

*The decisive metric* is `overturn_precision` = **0.614**. Framing the shipping
architecture as a cascade (`compareAnswer()` first, an accept is final; the classifier only
consulted on a rejection, and only able to overturn a rejection into an acceptance) reduces
the whole question to: of the pairs the classifier rescues, what fraction are genuinely
correct? Answer: 178 paraphrases rescued against 112 wrong answers admitted. Two wrong
answers admitted for every three paraphrases rescued.

*The adversarial held-out set* (`data/held_out/tricky_paraphrases.jsonl`, tracked because it
is not regenerable) is where it stops being close: of 61 deliberately hard wrong answers the
classifier correctly rejects **2**. It accepts "Chloroplasts are the site of aerobic
respiration" against a mark scheme naming mitochondria, and "Energy is absorbed by
mitochondria" against one saying released. See that file and the tooling README for its
provenance caveats — it was model-drafted rather than hand-written, its labels are
unreviewed, and it is adversarial by construction, so its error rates are a worst case
rather than a production estimate.

*Structural note:* the cascade turns out to be mathematically identical to the classifier
alone. Across 1,027 test pairs there is no case where `compareAnswer()` accepts and the
classifier rejects — the classifier accepts a strict superset. The cascade therefore cannot
improve accuracy by construction; its only benefit is a fast path avoiding the ~90MB model
load in the common case. Worth remembering if a future semantic tier is ever revisited.

*Deviations from the plan as written:*
- Step 2's word-order shuffle positives were **removed** (`f3d4496`). Reversing a
  mark-scheme sentence produces gibberish, and labelling it a match taught the classifier
  that word salad is correct — 676 of 5,807 pairs, working directly against Step 4's stated
  asymmetry. Removing them moved negative recall by 0.006, confirming the failure is
  representational rather than a data-quality artefact.
- Step 4's held-out set was **not hand-written**; see the caveat above.
- Data generation used GPT-5.6 (Chat mode, free tier) rather than Luna specifically. Batch
  quality was uniformly good and format compliance was total, so tier choice never became a
  live question.

*Bugs found and fixed during the pass:* the baseline bridge never ran through the CLI (path
resolution, `3428f3c`), and the baseline was scored over all pairs while the classifier was
scored on the test split, making the headline comparison meaningless (also `3428f3c`).

*If this is ever revisited*, the hypothesis to test is that the primitive is wrong rather
than the idea: the question is entailment ("does the typed answer entail the mark scheme
answer"), not similarity. NLI cross-encoders answer that directly — negation flips
entailment to contradiction while cosine barely moves — and remain small and CPU-only, so
the local-first constraint survives. That is a new plan, not a patch to this one.

*End of plan.*

---

## A.2 — A.8 Idea backlog (unstarted; one Sunday afternoon each)

Recorded at idea level only. Each entry states its falsifiable question and its
acceptable failure mode, per the appendix's charter: the deliverable is knowledge, and a
well-documented corpse is a valid outcome. None of these is promoted to anything until
its results say so. Where one needs a small labelled dataset, generation follows A.1's
recorded batch discipline (30–50 per message, strict delimited format, validate on
paste).

## A.2 Handwritten maths input (canvas + $1 recogniser)

**Question:** can a young student write `x² + 3` on a canvas with a finger faster and
more happily than they can find `^` on a keyboard? Template matching via the classic $1
gesture recogniser (1990s technology, no ML, a few hundred lines) over a per-symbol
template set, feeding the same lenient expression parser as Arc 11 §11.3. Probably a
negative result on recognition accuracy; worth running because the *input-preference*
half of the question survives even if recognition is poor, and it directly informs the
Arc 11 palette design. Failure mode: funny screenshots and a README that opens honestly.

## A.3 Predicted-marks backtest

**Question:** across the prompter's own sat exams while using Lacuna, how far were the
predicted exam-day figures from actual results? Tiny n, confounded, and still the only
calibration evidence available before Arc 12 shows this number to paying parents.
Deliverable: a one-page report of predicted vs actual with an honest error bar, and a
decision on whether the receipt headline needs a calibration caveat. Failure mode is
success either way — "the number is astrology" is the cheapest possible time to learn it.

## A.4 Chronotype audit

**Question:** does time-of-day of review predict lapse probability in the existing
`ReviewLog` history, controlling for retrievability at review? Pure analysis over data
already on device; no new collection. If the effect is real and large, a quiet
evidence-based session hint ("late-night new cards underperform for you") becomes a
candidate feature; if noise, a productivity-influencer talking point dies against real
homework. Watch for the obvious confound: what gets studied late at night is not a
random sample of cards.

## A.5 Gzip duplicate detection (compression distance)

**Question:** does normalised compression distance (the "gzip rivals embeddings" result)
catch paraphrased duplicate cards better than `checkDuplicatesBatch`'s current logic?
Directly relevant to Arc 11 §11.6's staging triage, where batch LLM generation will
produce paraphrase near-duplicates at scale. `CompressionStream('deflate-raw')` already
ships; the experiment is ~40 lines plus a labelled duplicate-pair set. Success promotes
it into `diff_import_preview`; failure costs an afternoon.

## A.6 Leech oracle (survival analysis)

**Question:** do card features observable at authoring time (length, cloze count, maths
presence, tags, siblings created in the same minute) predict which cards later cross the
leech threshold? Deliberately boring statistics — survival analysis or plain logistic
regression, no learned embeddings; the respectable cousin of A.1's instinct, with an
objective label and thousands of free examples in existing history. Success is a quiet
authoring hint ("cards shaped like this tend to become leeches"); failure is a null
result worth recording so the instinct stays buried.

## A.7 FSRS parameter transfer (per-user prior)

**Question:** for a user with fitted weights on existing courses, do those weights beat
the ts-fsrs defaults *out of sample* on a newly started course? Uses the shipped
binding trainer and the existing held-out log-loss harness (SPEC §8.1); no new
machinery. Success means new courses warm-start from a per-user prior instead of
factory defaults — a real scheduling win. Must respect the existing consent rule:
fitted weights are only ever applied explicitly.

## A.8 Adversarial student (scheduler fuzzer)

**Question:** what degenerate states can a property-based "student" — random grades,
pathological gaps, fail-everything months, exam-eve resurrections, opens-once-a-year
patterns — drive the scheduler, cram allocator, and revision planner into? Hunting NaN
priorities, starvation, double-serves, negative budget allocations across the
dual-governor, short-term-model and checkpoint-horizon interactions. Less an experiment
than a monster hunt; the deliverable is a set of invariants promoted into permanent
property-based tests, which makes this the one entry whose corpse is a test suite.
