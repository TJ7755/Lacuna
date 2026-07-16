# Lacuna — Post-Course-Architecture Plan

## Document purpose

Successor to `new_features_list.md` (the Course Architecture Plan). Covers the close-out of
that plan (Phase 8 and its recorded deferrals) and the next feature arcs, in order:

1. **Arc 0 — Course architecture close-out** (detailed)
2. **Arc 1 — Sequence learning** (detailed; ordered lists first, lines mode as v2)
3. **Arc 2 — MCP server / agent surface** (outline; to be planned in full when reached)
4. **Arc 3 — Cram-mode overhaul** (outline; the document owed by Addendum 2 §G/§M)
5. **Arc 4 — Lesson/Practice split, checkpoint-aware horizon & Study Now** (detailed)

Plugins and sync/collaboration are explicitly parked. Arc 2's design doubles as the
plugin-compatibility groundwork: the MCP tool surface over the repository layer is the
first — and for now only — extension point.

Also parked: **switching FSRS parameter optimisation to the official binding trainer**.
An abandoned June 2026 experiment (deleted branch
`copilot/production-hardening-round-two`, commits `c4fad61` and `8de902b`) attempted
this against the pre-Course-architecture codebase, touching `src/fsrs/optimise.ts`, the
optimise worker and Settings. The branch is unmergeable now; if revisited, redo it fresh
against the current `src/fsrs/optimise.ts` Web Worker design (SPEC.md §8.1).

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
> SPEC.md §5). The study-flow UI is also shipped: the first-letter hint step
> (`src/utils/firstLetterHint.ts`, `src/components/learn/LineHint.tsx`, wired into
> `src/pages/LearnMode.tsx` with an `h` shortcut) and strict typed grading via the
> global typing mode, with lines-mode detection in `src/db/linesModeCards.ts`.

Same `Sequence` machinery with a different skin:

- Items are lines; a `speaker` field per item; "my lines" marked so only those generate
  recall cards, with other speakers' lines serving purely as cue context (cue lines are
  the hinges — consistent with the actor-memory literature). **Shipped:** cue lines
  display speaker names by default (`NAME: line`), resolving the open question below.
- **First-letter prompt mode**: a graded hint (initial letters of the answer) before full
  reveal, as a mid-step in the reveal flow. **Shipped:** a Hint button (keyboard `h`) on
  the card front for lines-mode cards, showing `firstLetterHint`'s reduction
  ("To be, or not to be" -> "T b, o n t b"); ungraded and reset per card.
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

# Cross-arc notes

- All arcs follow existing conventions: additive schema migrations with pre-migration
  snapshots, pure logic modules with tests before UI, British English, no emojis.
- Arc ordering is deliberate: Arc 0 gives one data model, Arc 1 stabilises the repository
  API that Arc 2 exposes, Arc 3 is self-contained.
- Each arc gets its own detailed plan (or addendum here) before implementation begins;
  outline sections above are scope agreements, not specifications.

*End of plan.*
