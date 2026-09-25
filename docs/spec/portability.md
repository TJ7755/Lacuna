# 13. Import, export & backups (`src/db/importEngine.ts`,

`src/db/portability.ts`, `src/db/import.ts`, `src/db/export.ts`,
`src/db/backups.ts`, `src/sync/mergeSnapshots.ts`, `src/sync/manualMerge.ts`)

### Unified import engine (`src/db/importEngine.ts`)

A single, format-detecting import engine that powers all import locations in the
app:

- **Auto-detection** (`detectFormat`): examines input text and returns a
  `DetectedFormat` (confidence-scored) choosing from: `share-code`, `csv`, `tsv`,
  `markdown-table`, `markdown-list`, `json`, `plain-text`, or `unknown`. Detection
  short-circuits at 100K characters to keep large files responsive.
- **Supported formats:**
  - **CSV/TSV** — quote-aware delimited parser (`parseImport` from `import.ts`).
    Defaults: tab field separator, newline row separator; both customisable.
  - **Markdown table** — GFM tables with `|` separators. Column header mapping:
    `front`/`question`/`term`/`q` -> front; `back`/`answer`/`definition`/`a` -> back;
    `tags`/`tag`/`label` -> tags. Pipes in cell content are escaped on export.
  - **Markdown list** — three patterns: (1) definition-list style
    (`**Term:** Definition`), (2) ordered pairs (even-numbered items paired as
    Q/A), (3) blank-line separated blocks (first non-empty line = front, rest =
    back).
  - **JSON** — array of objects, or object with a `cards`/`data`/`items`/
    `entries`/`notes` key containing an array. Each object maps
    `front`/`question`/`term`/`q` -> front, `back`/`answer`/`definition`/`a` -> back.
  - **Plain text Q/A** — tab, pipe, em-dash, or en-dash separated Q/A pairs. A
    leading `Q:`/`Q.`/`Question:` prefix is stripped.
  - **Share codes** — `LAC0`/`LAC1` prefixed base64 or `LAC2`/`LAC3` prefixed Base45
    codes, decoded via `decodeShareCode`.
- **`parseImportAuto(text, fieldSep?, rowSep?)`** — the main entry point. Detects
  the format and delegates to the appropriate parser. Returns
  `{ cards, skipped, format }`.
- **Legacy parser** (`parseImport` in `src/db/import.ts`): the quote-aware
  delimited parser continues to exist for backward compatibility and is used as
  the CSV/TSV backend. Defaults: **tab** field separator, **newline** row
  separator. Windows/old-Mac line endings are normalised first. Per row: field 1
  = front, field 2 = back, optional field 3 of space-separated tags. A row with a
  back is a front/back card; a single column containing cloze notation becomes a
  cloze card; otherwise the row is skipped.

### Unified export panel (`src/components/import/UnifiedExportPanel.tsx`)

A single, reusable export UI offering multiple output formats:

- **Full backup (JSON)** — complete database snapshot including Cards, Card reviews, Concepts,
  Questions, Question relationships and Attempts, plus media assets (`downloadBackup`).
  Selected backup files over 200 MB are rejected before they are read or parsed.
- **CSV** — comma-separated values with all card fields.
- **TSV** — tab-separated values, compatible with Anki import.
- **Markdown table** (`exportCardsMarkdownTable`) — GFM table with Deck, Front,
  Back, and Tags columns. Pipes in cell content are escaped.
- **JSON array** (`exportCardsJson`) — array of objects with front, back, tags,
  deck, and type keys. Re-importable into Lacuna.
- **Plain text** — human-readable Q:/A: format with course, lesson, and tag metadata.
- CSV, TSV, Markdown, JSON-array and plain-text exports are Card-only. They are not a Question
  backup; use Full backup or a Course share for Question definitions.
- **Course share code** — compact, copy-pasteable course material generated from the dedicated
  Share page via `buildCourseShareCode`; it is not part of this full-backup/card-export panel.

### Backup file import/export

- **Export:** versioned JSON portable snapshot (`BackupFile`: decks, compact Card rows, canonical
  `reviewHistory`, referenced image/audio assets,
  session history, user performance, folders, courses, lessons, notes, lesson-card links and
  progress, `courseAssessments`, `revisionPlans`, `sequences`, `occlusions`, `concepts`,
  `questions`, `questionConcepts` and `questionAttempts`). Backups are
  the route that carries media between machines (share codes deliberately do not, §13); an
  occlusion's diagram is gathered explicitly from `Occlusion.assetHash`, since it is referenced
  by no Card Markdown. Question definitions and retained Attempt receipts are also scanned for
  `lacuna-asset://` references. Older backups are normalised through the pure v24 converter;
  legacy `courseExamDates` remains an import-only compatibility field.
- **Import modes:**
  - **Replace** — wipe the tables represented by the backup, then restore exactly. The UI
    calls this **Replace local data**, explains that there is no account or cloud copy, and
    requires a second explicit confirmation. `noteAnnotations` is also cleared but is not
    restored because it is device-local. Concepts, Questions, relationships and Attempts are
    replaced and restored with the rest of the represented data. Lineage mappings and pending
    merge-review queues are not represented by `BackupFile` and are not currently exported or
    cleared.
  - **Add from backup** — fold in by id (`importBackup(..., 'merge')`). The Settings recover
    flow shows the backup's lesson/card counts and applies immediately when **Add from backup**
    is pressed; it does not currently show a full add/change/overwrite diff or ask for a second
    confirmation. Incoming rows are added when absent; conflicting decks/cards and course records
    use their table-specific recency rules, review-history rows are deduplicated, and local rows
    absent from the backup are never deleted. Question authoring merges as one coherent definition
    and relationship bundle; Attempts union by identity, immutable receipt collisions fail, and
    answered lifecycle state wins over shown or abandoned state. The Question schedule is replayed
    from eligible Attempt evidence after merge. The other course tables, `sequences`, `occlusions`
    and `revisionPlans` follow their existing additive per-table merge boundary. Old backups keep
    this behaviour; only the Settings label changed.
  - **Another device** — a separate Settings action that does not call
    `importBackup(..., 'merge')`. `manualMerge` takes a forced restore point
    (`takeAutoBackup(true)`), reuses that snapshot, runs `mergeSnapshots(local, remote)`,
    then applies the result with `importBackup(merged, 'replace')`. The resting copy states
    that Cards, Questions and evidence from either side are kept and that a deletion on either is
    removed; confirmation is the existing inline prompt naming the file's date and card count. The toast
    reports cards kept, added and removed, plus reviews when those counts change, and that a
    restore point was saved. A file that fails `validateBackup` is rejected before any write; a
    failed safety backup aborts without applying.

### Automatic restore points & migration safety

- Up to the **ten most recent** snapshots are kept on-device; one is taken
  automatically on open, **at most once a day** (`autoBackupIfStale`), and never
  blocks the UI.
- **Pre-migration snapshot:** before a schema upgrade rewrites data, a
  `pre-migration`-tagged snapshot is captured in a **separate committed
  transaction** (via a dedicated `lacuna-pre-migration` IndexedDB) so a failed
  upgrade on the main database never rolls the snapshot back with it. The
  snapshot is also mirrored to the configured folder if the File System Access
  API is available. Tagged snapshots are **exempt from the ten-snapshot
  pruning**. The v4 image migration is also idempotent and
  reads-transforms-writes explicitly rather than mutating inside an async Dexie
  `.modify()` callback (which Dexie does not reliably persist).
- Restoring replaces all current data with the snapshot.
- Snapshot summaries display the number of Course lessons. The serialised `deckCount` field keeps
  its legacy wire name for compatibility but stores that lesson count for current snapshots.
- **Folder mirror** (where the File System Access API is supported): each backup
  can also be written to a chosen folder so it survives clearing browser data.
  Where unsupported, the UI explains this and points to manual export.

### Course sharing — share codes (`src/db/share.ts`, `SharePage`, `/share`)

A dedicated **Share** tab in the sidebar turns a whole course into a single, compact,
copy-and-paste (or scannable) **code** and rebuilds a course from one. It is distinct from
backup export: a share code carries only the **material** needed to recreate the course,
never one person's scheduling progress or review history.

- **What a code contains (current, v3 payload):** course metadata (name, exam objective,
  date created, an exam date or steady-retention marker, target retention, new-card cap), its ordered lessons each with
  their notes and cards (type, front, back, tags), and current `CourseAssessment`
  checkpoints. **Sequences**
  (§5) ride along as an additive optional field: each `Sequence` and its `SequenceItem`s
  travel inline, and on import every sequence/item id is remapped fresh alongside its
  generated cards' `sequenceItemId` (including the `::label` suffix for label cards), so a
  shared sequence never collides with one already present locally. Older v2 codes without
  a `sequences` field still parse. Lines mode's `mode`/`mySpeaker` (sequence) and `speaker`
  (item) travel as further additive optional keys on the same schema.
  **Occlusions** (§5) ride along the same way, as an additive `occlusions` field with an `oc`
  reference on each generated card, region ids remapped fresh on import and a pairing whose
  target region did not travel dropped rather than left dangling. Bank-scoped sequences and
  occlusions are excluded from both, since their generated cards are never packed.
  `LessonCardLink` (display-only cross-lesson linking) travels with the material so linked bank
  Cards remain linked after import. Concepts, fixed and generated Question definitions, and their
  primary/prerequisite relationships also travel; the importer remaps their identifiers with the
  rest of the Course. `PracticeNode`, lesson exposures, Question Attempts, Question scheduling,
  cardless-lesson completions and Practice milestones are deliberately out of scope — a shared Course carries
  material structure, not one learner's practice-path state.
- **What it omits — media, deliberately and loudly.** `stripAssetMedia` replaces every asset
  reference in card and note Markdown with placeholder text (`[Image omitted from share
code]`, `[Audio omitted…]`), so images and audio do not travel. An occlusion's diagram is
  not a Markdown reference at all and likewise never travels: its `assetHash` will not resolve
  for the recipient, and the study face falls back to each card's plain-text content. Solving
  asset transport properly needs either a companion asset file or the Arc 12 relay, so the
  chosen behaviour is **local and backup only, with the failure made loud**: the Share page
  counts affected cards — asset-bearing _and_ occlusion-generated — names them, and says what
  the recipient will actually receive. Backups carry assets properly (`BackupFile.assets`), so
  this is a share-code and published-lineage limitation only.
- **What it omits:** personal FSRS memory state, Card review history, Question Attempts and Question
  scheduling state, plus suspended/buried/flag state on Cards.
  Imported cards always start with clean scheduling for their new owner. Lesson exposures,
  cardless-lesson completions and Practice milestones are learner progress and are likewise
  omitted. Note annotations are device-local and are excluded from share codes as well as
  every other portability format. Older payloads may still contain the legacy compact `sf`
  lesson-filter field; it is accepted for import compatibility but does not configure live
  lesson study.
- **Legacy v1 payload:** the original flat list-of-decks shape is recognised so the importer can
  give a specific refusal. It is no longer imported or converted; current course shares use v2 or
  v3 payloads.
- **Compression**, in order of impact:
  1. **Reverse-pair folding** — a front/back card and its exact mirror (one's front = the
     other's back and vice versa) are detected and stored **once** as a single "reversible"
     entry (`k:2`), then expanded back into two independent cards on import (the same shape
     `createCardWithReverse` produces).
  2. Compact single-letter JSON keys.
  3. **DEFLATE** via the native `CompressionStream('deflate-raw')` when available.
- **Format:** a short encoding prefix followed by the encoded payload — `LAC1` (DEFLATE + base64,
  the default for copy-paste text), `LAC0` (plain base64, legacy uncompressed fallback),
  `LAC2` (DEFLATE + Base45, densest for QR codes), `LAC3` (plain Base45, legacy uncompressed
  fallback). Base45 (RFC 9285) maps directly to the QR Alphanumeric mode for ~30% more
  capacity than Base64. `LAC0`–`LAC3` identify encoding choices only; they do not promise support
  for a particular payload version. The payload version field (`v1`/`v2`/`v3`) is distinct from
  the prefix and guards forward compatibility. v1 deck payloads are refused; v2 and v3 course
  payloads are importable. An unknown or corrupted code yields a readable error.
- **Export UI:** select one course, then "Generate share code" — the code is shown in a
  read-only monospace box with a one-click **Copy**, a character count, and (where the
  payload fits a single QR symbol, up to `MAX_QR_ALPHANUMERIC_CHARS`) a scannable **QR code**.
- **Import UI:** a styled paste box, or a camera-driven **QR scanner** (`html5-qrcode`);
  "Read code" decodes and shows an inline confirmation preview (lesson/Card/Question counts, the share
  date, lesson names as chips) before committing. Importing always **creates a new course**
  — it never overwrites existing data.
- Round-trip behaviour (content, cloze, reverse-pair expansion, date-due preservation, clean
  scheduling state, v1 deck rejection and rejection of non-codes) is covered by
  `src/db/share.test.ts`.

### Classroom distribution — versioned courses and re-import merge (schema v18)

Share codes are one-shot by default (above): re-importing an updated code always creates a
second course. Schema **v18** adds an opt-in **Publish** flow so a teacher's revisions can
instead **merge** into a student's already-imported copy, preserving the student's FSRS
memory, exposure history and any local edits. No content hashing is used anywhere in this
feature — versioning is a teacher-initiated counter, not a derived value.

- **Teacher side — `Course.distribution?: { lineageId: string; revision: number;
publishedAt: number }`.** Absent until the teacher clicks **Publish** at least once.
  `publishCourse(courseId)` (`src/db/repository.ts`) generates a fresh `lineageId`
  (`makeId()`) on first publish and increments `revision` by exactly 1 on every
  subsequent call, stamping `publishedAt` with the current time; the teacher's own course
  is never locked and remains freely editable and re-publishable. When
  `Course.distribution` is present, the share-code export path packs `li` (lineage id) and
  `rv` (revision) onto the `SharePayloadV2` root, plus each lesson/note/card's originating
  id (see below) — a course that has never been published exports exactly as it always has,
  with no lineage fields at all.
- **Originating-id payload fields.** `ShareLesson` gains `i?: string`. `ShareNote` gains
  `oi?: string` rather than `i`, because `ShareNote.i` was already the pre-existing
  historical "media omitted" boolean flag (named for images before audio existed); reusing that
  letter would have collided. `ShareCard`
  needs no new field at all: its existing (already-optional) `id` — packed on every course
  export to resolve in-payload `links`/exam `x` references — doubles as the originating
  card id once a lineage is present, so cards are the one entity type with nothing added.
  All three are populated only when `li` is present.
- **Student side — `Course.distributedCopy?: CourseDistributedCopy`
  (`{ lineageId, revision, locked, autoAcceptUpdates, sourceLabel? }`).** Set on first
  import of a published course (`importLineageFirstTime`, `src/db/mergeImport.ts`), which
  diverges from the ordinary import path in exactly one way: every lesson/note/card
  **adopts its incoming originating id directly as its local id** instead of remapping
  through `makeId()`. This is safe because `makeId()` ids are globally unique regardless of
  which install generated them, and the merge path only ever writes ids that originated
  from `makeId()` on the teacher's own database — there is no mapping table, only a
  membership registry (below) recording which ids a course has already adopted.
  `locked` starts `true`; `autoAcceptUpdates` starts `false` (opt-in per course, not
  global — set via `setCourseAutoAcceptUpdates`).
- **`LineageIdMapping` table (`lineageIdMappings: 'id, courseId'`)** — one row per
  distributed course (keyed by `lineageId`), holding `lessonIds`/`noteIds`/`cardIds`/
  `sequenceIds`/`occlusionIds` arrays of adopted local ids (`occlusionIds` is optional —
  mappings written before image occlusion existed have no such field) plus a **last-merged content snapshot** for
  every adopted lesson/note/card (`lessonSnapshots`/`noteSnapshots`/`cardSnapshots`,
  keyed by id — name/description/isExtension/dates/sessionFilter/orderIndex for lessons,
  name/content/orderIndex for notes, type/front/back/tags for cards, deliberately excluding
  FSRS/scheduling fields). A re-import compares an entity's _current_ local content against
  its snapshot to detect a student edit since the last merge, rather than a separate dirty
  flag that could drift out of sync.
- **`pendingMergeReviews` table (`id, courseId`)** — queued merge decisions awaiting
  student review: one row per course, holding `updates`/`removals`/`conflicts` for the
  latest outstanding diff. A new merge for the same course **supersedes** rather than
  appends to the previous row, so the table never accumulates history. `creates` are never
  queued here — they apply immediately and unconditionally (below).
- **Merge apply (`mergeLineageUpdate`, `src/db/mergeImport.ts`), run against the pure
  diff module `src/db/lineageDiff.ts` (id-keyed, never positional or content-matched,
  generalising `diffRegeneration`'s shape from one sequence to a whole lineage):**
  1. **Creates** (incoming-only ids) are written immediately, adopting the incoming id as
     the local id — purely additive, nothing to review.
  2. **Updates and removals** where the local entity has not been edited since the last
     merge apply immediately if `distributedCopy.autoAcceptUpdates` is true; otherwise they
     are written to `pendingMergeReviews` and nothing changes locally until the student
     resolves them.
  3. **Conflicts** — an entity changed on both sides since the last merge, or a teacher
     removal of an entity the student has edited — are **always queued**, regardless of
     `autoAcceptUpdates`: the student's local version is left untouched either way, and the
     incoming version sits in the queue for visibility. This is the **student-wins**
     policy: a student's own edit is never silently overwritten or discarded by an
     incoming teacher change.
  4. Card updates are a strict content subset (`type`/`front`/`back`/`tags`) that never
     touches FSRS/scheduling fields (`state`, `stability`, `difficulty`, `due`, `reps`,
     history), mirroring `diffRegeneration`.
  5. Sequence- and occlusion-shaped payload items are **not** diffed by `lineageDiff.ts` at
     all — they are handed unconditionally to their existing regeneration path
     (`updateSequence`/`updateOcclusion`), which already encodes "update content only, never
     FSRS fields" keyed by the stable `sequenceItemId`/`occlusionRegionId`; this is never
     gated by `autoAcceptUpdates`. Their **generated cards are correspondingly skipped on
     both sides of the diff** — incoming cards carrying `si`/`oc`, and local cards carrying
     `sequenceItemId`/`occlusionRegionId`. Without that skip the merge both adopted the
     packed copy under its originating id and regenerated the same card, leaving two cards
     per item with the adopted one frozen at the publishing revision.
  6. On completion, `distributedCopy.revision` is set to the incoming revision and
     learner-owned scheduling preferences, including **Learn first**, are preserved.
     `lineageIdMappings` is updated with any newly adopted ids and refreshed content
     snapshots for every entity actually applied (auto-accepted updates and creates); an
     entity left queued or in conflict keeps its old snapshot, since nothing changed for it
     locally yet.
  7. **Decode-time routing:** a decoded payload carrying `li` is matched against the
     student's own `distributedCopy.lineageId` values (never the teacher's); a match routes
     to the merge path, otherwise it falls through to the ordinary
     `importCourseSharePayload` exactly as today — this covers both genuinely new courses
     and any course whose local copy predates schema v18 and so has no `distributedCopy` to
     match against.
- **Lock enforcement — `canEditLessons(course)` (`src/course/lessonViewMode.ts`).** Returns
  `false` iff `course.distributedCopy?.locked === true`; an absent `distributedCopy` (every
  ordinary course, including all pre-v18 courses) or a detached copy (`locked: false`) both
  remain editable. This is the single gate every lesson/note/card-CRUD call site already
  routes through (`resolveLessonViewMode`, `isLessonAuthoringMode`), so locking a
  distributed copy needed no new call sites — only this function's body changed.
- **Detach (`detachCourse`, `src/db/repository.ts`)** — a one-way, student-initiated escape
  hatch (confirm dialog via `ConfirmInline`, destructive framing) that clears
  `Course.distributedCopy` entirely, unlocking the course and severing lineage tracking in
  the same step: it deletes the course's `LineageIdMapping` row and any pending merge
  review, but never touches lesson/note/card content. A later re-import of the same share
  code no longer matches this course and instead imports as an independent copy — the same
  "no lineage, treat as new" fallback a pre-v18 course already takes on import.
- **Review panel (`MergeReviewPanel`, `src/components/import/MergeReviewPanel.tsx`)** — a
  course-scoped `/course/:courseId/updates` route reached from a quiet accent **"Update
  available"** badge on the dashboard course card (`CourseCard.tsx`) and a **"Review
  updates"** entry point in the `CoursePath` header, both shown iff a `pendingMergeReviews`
  row exists for the course. Renders three sections — Updates, Removals, Conflicts — each
  row offering the accept/reject action pair, plus a bottom bar with a bulk **Accept all**.
  Conflict rows flip the emphasis: **"Keep mine"** (reject) is the emphasised default
  action and **"Take theirs"** (accept) the secondary one, matching the student-wins policy
  above.
- **Resolution functions (`src/db/mergeImport.ts`)** — `acceptMergeReviewItems`/
  `rejectMergeReviewItems(reviewId, refs)` resolve a specific set of items; `acceptAllMergeReview`/
  `rejectAllMergeReview(reviewId)` resolve everything outstanding. All four route through the
  same content-only apply helpers `mergeLineageUpdate`'s auto-accept branch uses (never a
  second apply implementation) inside one `db.transaction`, then either delete the
  `pendingMergeReviews` row (nothing left outstanding) or `put` it back with the resolved
  items spliced out. Accepting an update or a "take theirs" conflict **refreshes that
  entity's `lineageIdMappings` snapshot** immediately, so the next merge's student-edit
  detection compares against what is now on disk instead of re-flagging an update the
  student has already taken; accepting a removal deletes the entity and drops it from the
  mapping's id lists and snapshots. Rejecting an item is a pure drop from the queue — the
  student's current content is never touched. **`acceptAllMergeReview` excludes
  conflicts** from its bulk accept (only updates and removals), so a student-edited
  conflict is never silently resolved by "Accept all" — it stays queued for an explicit
  per-row decision; `rejectAllMergeReview` clears everything, including conflicts.
- **`autoAcceptUpdates` toggle** — `setCourseAutoAcceptUpdates(courseId, value)`
  (`src/db/repository.ts`) persists the per-course preference read by the merge-apply
  decision above; surfaced as an instant-commit `Toggle` in the existing "Shared course"
  settings section (`DetachCourseSection.tsx`, above the detach control), labelled "Apply
  updates automatically". The toggle only changes future merge behaviour — it does not
  touch any already-queued `pendingMergeReviews` row.
- **Decode-time merge routing (`SharePage.tsx`, `UnifiedImportPanel.tsx`)** — decoding a
  share code now checks `isLineagePayload(payload)` and, if `li` is present, calls
  `findCourseForLineage(payload.li)` to see whether the payload's lineage matches a course
  already imported locally (matched only against a local course's own
  `distributedCopy.lineageId`, never a teacher's `distribution.lineageId` — so a teacher
  scanning their own published code, or anyone with no local copy of that lineage, falls
  straight through to the ordinary `importCourseSharePayload` path unchanged). On a match:
  - **Revision guard.** If the payload's `rv` is not newer than the local copy's
    `distributedCopy.revision`, the preview reports the course is already up to date and
    the confirm action becomes **Close** rather than calling the merge importer at all —
    a stale or duplicate scan is a no-op, not a rejected merge.
  - Otherwise the preview reads **"This updates `<course name>` (revision N → M)"** and
    confirming calls `mergeLineageUpdate(course.id, payload)` instead of
    `importSharePayload`. The result notice/toast summarises what applied immediately
    (creates/updates/removals) and, if anything was queued, adds "N changes are waiting
    for your review."

**MCP tools** (`src/mcp/tools/lineage.ts`, additive — no `MCP_TOOL_SURFACE_VERSION`
bump): `lacuna.diff_lineage_update` (read-tier) previews a re-published payload's
classification against a tracked course without writing, reusing the exported
`detectStudentEdits` and pure `diffLineage` so the preview cannot drift from
`mergeLineageUpdate`'s behaviour; `lacuna.apply_lineage_update` (write-tier,
consent-gated) calls `mergeLineageUpdate` directly and may pre-resolve queued items via
the same `acceptMergeReviewItems`/`rejectMergeReviewItems` functions the review panel
uses.


[Specification index](../SPEC.md)
