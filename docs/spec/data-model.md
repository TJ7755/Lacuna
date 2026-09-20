# 5. Data model (Dexie, `src/db/`)

All tables are keyed by string `id` unless noted. Types live in `src/db/types.ts`.

### Course architecture (the user-facing model)

Schema **v9** introduced the `Course -> Lesson -> Note + Card` model. This is the only model
the UI exposes: every route, sidebar entry and page works in terms of courses, lessons, notes
and cards. Core stores are `courses, lessons, notes, lessonCards, practiceNodes,
lessonCardExposures, lessonCompletions, noteAnnotations, practiceMilestones` and
`courseAssessments` (shapes in `src/db/types.ts`). The old `courseExamDates` store is a
legacy migration/import boundary and is not present in the current schema. Sequences,
occlusions and revision plans are separate current stores. The v9 upgrade folded each
pre-existing standalone deck into
one single-lesson course (scheduling fields copied verbatim) and each folder into one course
whose decks became lessons ordered by `createdAt`; a deck whose exam date differed from the
course kept it as a per-lesson override. Migration mapping lives in
`src/db/courseMigration.ts` (pure, with an injected id generator). Cards gained
`courseId?`/`primaryLessonId?`, and `SessionHistoryEntry`/`UserPerformance` gained
`courseId?`, all stamped during the upgrade.

A course's static metadata includes `name`, `description`, and optional `examBoard` and
`specification` plain strings. The provenance fields are unindexed, additive metadata edited in
Course Settings and included in batch-generation prompt context only when present; they do not
create a first-class exam-board or specification entity.

The React-free persistence modules in `src/db/` expose course operations. Card, review, Course,
Lesson and assessment writes live in `cardRepository.ts`, `reviewRepository.ts`,
`courseRepository.ts`, `lessonRepository.ts` and `assessmentRepository.ts`, alongside the existing
Note, Practice-node, Sequence and revision-plan repositories. Each operation retains its complete
Dexie transaction scope, including cascades, review history and tombstones. `repository.ts` is a
compatibility export surface; new callers should import the owning module. Read operations remain
in `read.ts` and the existing specialised readers. The assessment interface replaces the old
course-exam-date interface.
Batch linking validates lesson/card existence, same-course membership and non-primary
membership in one `lessonCards` write transaction; IndexedDB serialises overlapping writes
to that store, making the idempotent duplicate check safe without another schema index.
All functions are independently callable with no UI or React dependency, so future AI
authoring agents and button handlers can share the same layer without duplication.

`PracticeNode.type` is `'auto'` or `'manual'`. Auto nodes are never persisted — they are
computed fresh on every path render from the live due-card backlog (§4.3's path diagram).
Manual nodes are teacher-authored and persisted. In Author mode, an edit badge on an existing manual
node lets a teacher reposition, rename or delete it (`PracticeNodeEditor`,
`src/components/course/`). The path's **Add practice** action opens the same editor for creation,
including on an inline single-lesson course. The badge and creation action are absent in Study mode.
`PracticeNodesSection` in course settings lists existing nodes and links to the path for editing.
Filters (`CardFilter[]`) remain supported in storage but are not authorable in the UI because there
is no existing filter builder to reuse.

`LessonCardExposure { lessonId, cardId, taughtAt }` records that one card has been
introduced successfully in one lesson. The `(lessonId, cardId)` pair is unique. This is
separate from FSRS memory state because a linked card may be introduced independently in
several lessons. Simple answers also update the card's shared FSRS state. Lesson completion
and semi-linear unlocking require exposure records for every primary and linked card currently
included in the lesson. Exposure rows are included in backups and restore points, excluded
from course share codes, and cascade with their lesson, card or link.

`LessonCompletion { lessonId, completedAt }` records explicit completion of a cardless
lesson when the learner presses **Continue** after its notes. It is learner progress, so it
is included in backups and restore points but excluded from course share codes.

`NoteAnnotation { id, noteId, startOffset, endOffset, selectedText, body?, createdAt,
updatedAt }` stores a text highlight and its optional free-text annotation. Offsets address
the note's Markdown source; `selectedText` validates the anchor after edits so a stale anchor
is shown as detached rather than applied to unrelated text. Annotations are deliberately
device-local: they are excluded from manual exports, automatic restore points, backups and
course share codes, and are deleted with their note. The first version accepts a selection
only within one ordinary text block; code, maths, embeds and cross-block selections are
rejected.

`PracticeMilestone { nodeKey, courseId, scopeVersion, securedCardCount, totalCardCount,
updatedAt, completedAt? }` stores resumable progress and persistent completion for a manual
or deterministically keyed automatic Practice node. `scopeVersion` prevents stale completion
from being applied to a changed card scope. Milestones are included in backups and restore
points, excluded from course share codes, and are separate from the live readiness value.

Schema **v12** adds `lessonCardExposures`, `lessonCompletions`, `noteAnnotations` and
`practiceMilestones`. Existing reviewed cards are backfilled only for their primary lesson.
Linked rows are not backfilled because the old display-only link proves nothing about where
the card was taught.

### Review history (schemas v20, v26 and v27)

Schema **v20** adds the canonical `reviewHistory` store, indexed by
`id, cardId, deckId, courseId, primaryLessonId` and `timestamp`. A `ReviewHistoryEntry`
extends `ReviewLog` with its stable store id and card/course ownership. The migration copies
every existing `Card.history` row, including legacy entries without an `eventId`, using a
deterministic id with collision handling; it does not prune or discard history.

Schema **v26** completes the cutover. Its atomic upgrade copies and verifies every remaining
inline event before clearing the duplicate `Card.history` arrays. The Card-table write hook keeps
the stored projection empty across ordinary writes, restores, imports and generated-card modules.
Runtime readers still return the same hydrated `Card.history` interface from canonical rows, and
legacy backup, peer and APKG inputs may still supply inline-only events at the import seam. An
explicit canonical result, including an empty one, remains authoritative. Current backups and peer
snapshots carry each event once in `reviewHistory`; their Card rows carry an empty `history` array.
No event is pruned or compacted by this cutover.

Schema **v27** atomically backfills a derived `reviewActivity` table containing each Card’s
review timestamps. Database middleware maintains it in the same transaction as every canonical
review mutation, including imports, deletion and undo. Duplicate timestamps remain distinct;
projection failure aborts the transaction. The derived table is excluded from backups and sync.
Dashboard and sidebar activity reads use these compact rows for streaks, heatmaps and rolling
new-card limits, filtering out events whose Card is absent. Search uses Card projections directly;
its content and management filters do not need history. The Card library also reads projections;
expanding a Card hydrates its canonical history for analytics. Study and history-sensitive readers
retain the canonical hydration interface.

After durable grading, trajectory sampling waits until the next browser frame, coalesces pending
work for the same unit/day, and yields during prediction to keep subsequent interactions responsive.
Backup replacement and merge write review history in bounded batches inside their existing atomic transaction.

### Concepts and Questions (schema v24)

Schema **v24** separates direct-recall Cards from post-instruction application Questions. It adds
`concepts`, `questions`, `questionConcepts` and `questionAttempts`, and assigns each surviving Card
one stable `conceptId`. Question contracts live in `src/questions/types.ts`; the canonical domain
terms and rationale are defined in
[Domain glossary](../domain-language.md) and [`docs/plans/question-mode.md`](../plans/question-mode.md).

A `Concept` is a stable knowledge identity. New Concepts are course-scoped; migrated Cards outside
a Course retain compatibility-only Concepts scoped to their legacy scheduling unit, which Questions
cannot target. A Card presents one Concept for direct recall. Every fixed Question or generated
Question family has exactly one primary Concept and zero or more prerequisite Concepts; the
repository rejects missing, duplicate, dual-role and cross-Course relationships. A Question result
never writes Card history or scheduling, and Card evidence never writes Question state. Card
readiness and Question performance therefore remain separate rather than pretending that transfer
evidence is identical to direct-recall evidence
([Pan and Rickard, 2018](https://pubmed.ncbi.nlm.nih.gov/29733621/)).

A fixed Question stores a Markdown prompt, deterministic numeric or compiled working payload and a
mandatory worked explanation. A generated Question family stores a built-in generator key, version
and validated configuration. Every presentation creates a `QuestionAttempt` receipt before display;
the receipt preserves the exact prompt, answer specification and feedback, plus the seed, parameters
and fingerprint for a generated variant. The first submission is immutable, and an optional
correction is stored separately after the learner sees worked feedback. Explanation feedback is
mandatory because it is particularly useful when the later task requires inference rather than
mere repetition ([Butler, Godbole and Marsh, 2013](https://eric.ed.gov/?id=EJ1007933)).

Question scheduling uses a dedicated adapter over `ts-fsrs`: full marks map to **Good (3)** and any
incomplete result maps to **Again (1)**. Partial marks do not map to Hard because Hard is a
successful FSRS recall rating and would lengthen the interval. A checker dispute or undetermined
line retains the evidence but withholds scheduling. Shown, abandoned, corrected and undone lifecycle
changes produce no new schedule evidence. Semantic edits start a new scheduling epoch; merge derives
the current Question schedule by replaying eligible Attempts.
([official FSRS tutorial](https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md?plain=1))

Eligible legacy numeric and working Cards with a Course and usable prompt migrate through a pure
deterministic converter. The conversion preserves available historical evidence as Question
Attempts and avoids double-counting one old event as both a Card review and a Question answer.
Course-less, malformed, unsupported or distribution-protected records remain Cards rather than
being guessed through a lossy conversion. The v24 migration is destructive in meaning and therefore
requires the existing pre-migration restore point.

### Sequences — overlapping-cloze sequence learning (schema v11)

Schema **v11** adds `sequences: 'id, courseId, primaryLessonId, createdAt'` (additive; no
`upgrade()` needed) and one optional indexed field on `cards`: `sequenceItemId`. A `Sequence`
is an **authoring-time entity only** — it is never itself studied — that generates ordinary
`front_back` `Card` rows via **overlapping cloze**: for items `i₀ … iₙ` and a configurable
`cueWindow` (default 2), each generated card's front shows the preceding `min(cueWindow,
position)` item values (plus the sequence name and, if chunked, the chunk label) and its back
is the item's own value. The first item is cued by the sequence/chunk name alone. This
directly targets the serial-position effect (mid-sequence recall is weakest) by giving every
element a turn as the recall target with local context as the cue.

- `Sequence { id, courseId, primaryLessonId: string | null, name, description?, mode?,
items: SequenceItem[], cueWindow, chunkLabels?, generateLabelCards?, mySpeaker?, presetId?,
createdAt }` — `items` is ordered and stored inline (sequences are small); `primaryLessonId`
  follows the same semantics as `Card.primaryLessonId`. `generateLabelCards` (default off)
  additionally generates an unordered label -> value card per item that carries a `label`
  (e.g. "Atomic number 11 -> ?"), alongside the positional card. These are additive optional
  fields — no schema/index change was needed to add lines mode or presets.
- `SequenceItem { id, value, label?, chunkIndex?, speaker? }` — `id` is stable across edits
  and anchors the generated card(s); `value` is Markdown. `speaker` is optional even in lines
  mode: a speakerless item is always "mine" (see below).
- **Lines mode** (`mode: 'lines'`; `mode` undefined/`'list'` is the original ordered-list
  skin and is unaffected). Items are lines, optionally speaker-tagged
  (`SequenceItem.speaker`) for a scripted scene; `Sequence.mySpeaker` names the one speaker
  whose lines are the recall target — a sequence-level flag (like `cueWindow`/`chunkLabels`)
  rather than a per-item one, since one speaker is "mine" for the whole scene. An item with a
  `speaker` generates a card only if it matches `mySpeaker`; a **speakerless item always
  generates a card**, since there is no other speaker to disambiguate it from — this is what
  lets poetry/verse and a solo speech reuse lines mode with no speaker configuration at all
  (`isMyLine` in `src/db/sequenceGeneration.ts`). Non-mine speaker-tagged lines never get
  their own card but still count towards the cue window, so a generated front reads like a
  script: cue paragraphs render as `NAME: line` (`cueText`) when the cue item has a speaker,
  or a bare value otherwise, and the first-in-scene prompt reads "First line?" instead of
  "First item?". Regeneration (`diffRegeneration`) needs no lines-specific logic beyond
  `generateCards` already filtering by `isMyLine`: switching `mySpeaker` diffs like any other
  content change — deletes the old speaker's cards, creates the new speaker's.
- **Presets** (`src/db/sequencePresets.ts`): a thin, data-only layer over the two modes above
  — no separate generation path. `SEQUENCE_PRESETS` bundles, per named scenario, a `mode`, a
  `defaultCueWindow`, whether the editor should offer speaker tagging (`usesSpeakers`), and
  editor terminology (item/chunk nouns). The sequence editor's picker renders this table
  directly; picking a preset just seeds `mode`/`cueWindow` and relabels the editor. Six
  presets ship: **Ordered list** (`list` mode, the plain default), **Poetry / verse** and
  **Speech / presentation** (`lines` mode, no speakers — mechanically identical once
  speakerless lines are always "mine", kept as two rows purely for name/description since the
  table makes that free), **Script / dialogue** (`lines` mode, `usesSpeakers: true` — the
  original lines-mode behaviour), and **Procedure / checklist** and **Timeline** (`list`
  mode, step/era terminology). `Sequence.presetId` persists which preset was picked, purely
  so editing later redisplays the same terminology; `presetForSequence` falls back to
  inferring a preset from `mode`/`mySpeaker` for sequences created before presets existed (or
  if a preset id no longer resolves), defaulting speakerless `lines` mode to poetry.
- **Lines-mode study flow** (Learn mode): cards generated from a `lines`-mode sequence get
  an optional two-step **hint ladder** between question and reveal — a Hint button on the
  card front (keyboard: `h`) that advances no hint -> first letters -> first words:
  - Step 1, first letters: the answer reduced to each word's initial letter
    (`firstLetterHint` in `src/utils/firstLetterHint.ts`, e.g. "To be, or not to be" ->
    "T b, o n t b"; punctuation kept in place, whitespace normalised).
  - Step 2, first words: the answer reduced to the first word of each clause/sentence
    chunk (`firstWordsHint` in `src/utils/firstWordsHint.ts`, e.g. "To be, or not to be,
    that is the question" -> "To…, or…, that…"; boundary punctuation kept in place).
    The button label reflects the next step ("Hint" then "More hint"); both steps are
    rendered by `LineHintButton`/`LineHintDisplay` (`src/components/learn/LineHint.tsx`).
    The ladder is ungraded and resets per card; full reveal remains the existing, separate
    flip action. LearnMode resolves which pool cards are lines-mode once per session via
    `linesModeSequencesByCard` (`src/db/linesModeCards.ts`), which batches one
    `listSequences` per distinct courseId among the pool's generated cards. Strict grading
    reuses the global typed-answer mode: with the typing setting on 'type', a lines-mode card
    is typed against verbatim and diffed word-by-word via `compareAnswer`
    (`src/utils/answerComparison.ts`) — feedback only; Yes/No self-grading remains the grade.
    Using any hint step is recorded as `ReviewLog.hintUsed` and nudges the invisible
    silent-mode grade (see "The invisible timer & grading" below); manual grading is
    unaffected.
- **Script paste import** (`src/db/scriptSplitter.ts`, `splitScript`): a pure parser for the
  lines-mode editor's paste + auto-split flow. A line matching `NAME: dialogue` starts a new
  item for that speaker; a following non-matching line is folded in as a wrapped continuation
  of the same speech; blank lines are separators only and never break a continuing speech.
  `src/components/sequences/ScriptPasteImport.tsx` wraps it in a paste → preview → correct →
  confirm modal (mirroring `LinkCardsDialog`'s shell) so the author can fix a misattributed
  speaker or line before it replaces the editor's item list.
- `Card.sequenceItemId?: string` is present iff the card was generated from a sequence item:
  the positional card carries the item's own id; the label card (when generated) carries
  `${item.id}::label` (`LABEL_CARD_SUFFIX`), so the two never collide and `isLabelCardId`/
  `baseItemId` (`src/db/sequenceGeneration.ts`) can recover the relationship without a
  second field.
- **Generation and regeneration** (`src/db/sequenceGeneration.ts`) is a pure, Dexie-free
  module — deliberately so its correctness (the risk centre of this feature) is covered by
  exhaustive unit tests ahead of any UI or repository code. `diffRegeneration` compares a
  previous and edited `Sequence` and produces create/update/delete instructions per card: an
  edited item updates its card's content in place (memory state kept); an inserted/reordered
  item regenerates only the affected cue-window fronts (memory state kept, since the recall
  target is unchanged); a deleted item deletes its card. `sequenceForItemId` resolves which
  `Sequence` (if any) owns a generated card's `sequenceItemId`, for grouping/badging.
- **Repository** (`src/db/sequenceRepository.ts`, re-exported from `src/db/repository.ts`):
  `createSequence`/`updateSequence`/`deleteSequence`/`listSequences`, plus
  `snapshotSequence`/`restoreSequence` for the standard undo pattern (a `SequenceSnapshot`
  captures the sequence and its generated cards together). `createSequence` and
  `updateSequence` generate/regenerate cards in the same transaction as the sequence write.
- **Portability**: sequences ride through backup export/import (replace and merge, by the
  same per-table semantics as the other course-architecture tables), diagnostics bundles
  (`sequences` count), and course share codes as an **additive v2 field** (§13) — older v2
  codes without it still parse. `presetId` travels as share code field `pr`, but only when it
  can't be re-derived from `m`/`ms` alone (i.e. only to distinguish poetry from speech, or
  procedure/timeline from a plain list) — `presetForSequence` on both ends keeps the common
  case free of payload cost.
- Generated cards are **read-only** in the card editor (edit the sequence instead) and
  carry a `GeneratedCardBadge` (`src/components/cards/GeneratedCardBadge.tsx`) wherever cards are
  listed, searched or shown in the Quick search overlay; `CardList` additionally groups
  generated cards under their owning sequence (`GeneratedCardGroup`, shared with occlusions)
  rather than listing them loose (§12). This is enforced below the UI too: `deleteCards`/`moveCards` (the
  generic bulk mutations) run an `assertNoGeneratedCards` check and throw if any targeted
  card has a `sequenceItemId`, while sequence-internal paths (`updateSequence`'s diffing,
  `deleteSequence`) mutate `db.cards` directly and bypass the guard.
- **Quick entry:** the add control follows the item list, so it remains beside the current
  working position, while each row also offers an add-below control. Adding an item focuses
  it and scrolls it into view without overriding reduced-motion preferences.
  `Ctrl/Cmd+Enter` from a non-empty item's value editor inserts and focuses the next item
  directly after it; an empty item is marked invalid instead of creating blank chains. The
  shortcut is scoped to item content and does not fire from sequence metadata fields.

### Occlusions — image occlusion (schema v19)

Schema **v19** adds `occlusions: 'id, courseId, primaryLessonId, createdAt'` (additive) and one
optional indexed field on `cards`: `occlusionRegionId`. An `Occlusion` follows the Sequence
precedent exactly: an **authoring-time entity only**, never itself studied, that generates
ordinary `front_back` `Card` rows — one per region — anchored by a stable region id, so editing
a region regenerates that card's presentation while preserving its FSRS memory state. It is
deliberately _not_ an Arc 11 `payload`: a payload has no owner to regenerate from.

- `Occlusion { id, courseId, primaryLessonId: string | null, name, assetHash, regions:
OcclusionRegion[], createdAt }` — `regions` is stored inline (occlusions are small);
  `primaryLessonId` follows the same semantics as `Card.primaryLessonId`. `assetHash` names
  the diagram in the `assets` store.
- `OcclusionRegion { id, role, shape, x, y, w, h, answerText?, pairedRegionId?, backNote? }` —
  `id` is stable across edits and anchors the generated card. **Coordinates are fractions of
  the image (0..1), never pixels**, so masks hold their position under `FlipCard`'s responsive
  sizing and at any zoom. `shape` is `'rectangle'` in this version but is persisted explicitly
  so later geometry never has to guess what an old record meant.
- **A region's role decides which of two card kinds it produces**, from one annotated image:
  - A **label** region covers text already printed on the diagram. Revealing it uncovers the
    diagram's own pixels, so the author types nothing.
  - A **feature** region points at part of the drawing. Its answer is the _paired_ label
    region (`pairedRegionId`), uncovered on the back; an unpaired feature falls back to its
    own `answerText`.
- **Masking rules** (`resolveOcclusionFace`): both kinds mask **every** label region on the
  front, without exception — a feature card that left labels visible would be answerable by
  reading the picture, and a label card that left its siblings visible by elimination. The
  card's own region is always ringed as the target. The back lifts exactly one mask.
  `backNote` renders below the image where present.
- `Card.occlusionRegionId?: string` is present iff the card was generated from a region.
  Region geometry is **never** copied onto the card: the study renderer resolves masking live
  from the owning `Occlusion`, which is what keeps `diffRegeneration`'s front/back-only update
  contract intact. The card's `front`/`back` carry a plain-text fallback only
  (`"Label 3 of 6 — Plant cell"`), so search, the card-list preview and any client that cannot
  render an occlusion degrade to something legible rather than blank.
- **Generation and regeneration** (`src/db/occlusionGeneration.ts`) is a pure, Dexie-free
  module tested exhaustively ahead of any UI, and routes through the same `diffRegeneration`
  contract as sequences: moving or resizing a region, changing its role, or re-pairing it
  rewrites that card's content and keeps its memory state; deleting a region deletes its card;
  adding one creates a card; replacing the image regenerates every card in the occlusion (the
  editor warns first). FSRS/scheduling fields are never written.
- **Repository** (`src/db/occlusionRepository.ts`): `createOcclusion`/`updateOcclusion`/
  `deleteOcclusion`/`listOcclusions`, plus `snapshotOcclusion`/`restoreOcclusion` for the
  standard undo pattern. Creates and regenerations happen in the same transaction as the
  occlusion write. `updateOcclusion` clears a `pairedRegionId` left dangling by a removed
  label region, so the surviving feature card regenerates against its own `answerText` rather
  than pointing at a region that no longer exists.
- **Diagram upload** (`src/db/occlusionImage.ts`) uses its own 2560px longest-edge ceiling
  rather than `compressImage.ts`'s 1280px default, so small printed labels survive
  compression legibly. Otherwise identical to the ordinary image path.
- **Study** (`src/components/occlusion/OcclusionStudyFace.tsx`): masked labels, ringed target,
  ordinary reveal and grade row. Hidden labels use opaque neutral masks; the active label
  uses an opaque accent-soft fill and a contrasting Fraunces question mark. Revealed labels retain
  one solid outline. Colours follow the selected accent and theme without changing diagram
  or card sizing. `occlusionDataByCard` (`src/db/occlusionStudy.ts`) resolves
  each pool card's owning occlusion once per session, batching one `listOcclusions` per
  distinct courseId — the same approach `linesModeCards.ts` uses. Typed mode is offered only
  where the target region resolves an `answerText`. **A missing asset degrades to the card's
  plain-text fallback rather than a broken image**, which is what makes §13's share-code
  behaviour merely disappointing rather than unusable.
- **Editor** (`src/pages/OcclusionEditor.tsx`, routes `/course/:courseId/occlusion/new`,
  `/course/:courseId/lesson/:lessonId/occlusion/new` and `…/occlusion/:occlusionId/edit`): two
  draw tools (label box, feature), a region list with role chips and inline pairing, a detail
  pane, and a live generated-card count in the footer, following the sequence editor's
  precedent. Regions default to `Box 1…n` so the list is navigable with no typing. Authoring
  is deliberately desktop-first: drawing with a finger works but is not separately optimised.
- **Portability**: occlusions ride backup export/import (replace and merge) and diagnostics
  bundles (`occlusions` count) by the same per-table semantics as sequences. A diagram is
  referenced _only_ by `Occlusion.assetHash` — never by card Markdown — so both
  `exportDatabase` and the asset GC gather occlusion hashes explicitly; without that a backup
  would restore occlusions with no image. Share codes carry occlusions as an additive v2
  field, but **not** the diagram (§13).
- Generated cards are **read-only** in the card editor and carry a `GeneratedCardBadge`
  wherever cards are listed, searched or shown in the Quick search overlay; `CardList` groups them
  under their owning occlusion (`GeneratedCardGroup`, shared with sequences) rather than
  listing them loose. Enforced below the UI by the same `assertNoGeneratedCards` guard on
  `deleteCards`/`moveCards`.

### Deck and Folder (retired stores, compatibility types only)

`LegacyDeckRecord` (`id, name, examDate, createdAt, ...`) and `LegacyFolder` (`id, name,
parentId?, createdAt`) describe the retired stores at compatibility boundaries. Schema v22
removed those live stores; `schedulingUnits` now holds the current Course/Lesson scheduling
contexts. The legacy types remain for the Dexie upgrade chain, pre-migration snapshots and the
explicit rejection of backups that still carry non-empty Deck or Folder rows. No page, route or
sidebar entry exposes a Deck or Folder.

### Card

`id, deckId, courseId?, primaryLessonId?, conceptId, type, front, back, payload?, stability|null, difficulty|null,
lastReviewed|null, reps, lapses, state, tags?, suspended?, flagged?, buriedUntil?,
reverseCardId?, sequenceItemId?, occlusionRegionId?, due|null, scheduledDays, learningSteps,
history[], createdAt`

- `front`/`back` are Markdown source. **Cloze** source lives entirely in `front`
  (`{{cN::...}}`); `back` is empty.
- `conceptId` names the stable Concept this direct-recall presentation belongs to. Alternate Card
  presentations may share a Concept while keeping independent Card schedules.
- `payload` is a compatibility boundary for structured Cards that could not be converted during the
  v24 migration, including course-less records, blank or malformed prompts, unsupported payloads
  and records protected by unresolved distribution state. New numeric and working content is
  authored as Questions, not Cards. Recognised legacy payloads remain readable; unsupported
  versions do not gain a grading path by accident.
- `tags` remain free-form strings. Specification-point provenance uses the manual `spec:3.4.1`
  convention; there is no separate specification-point model or batch-generation field.
- `stability` (days; the interval at which R = 0.90), `difficulty` (in [1,10]),
  `lastReviewed`, `due` are all `null` until the first review.
- `reps, lapses, state, scheduledDays, learningSteps, due` mirror ts-fsrs's card fields.
  `state in {0 New, 1 Learning, 2 Review, 3 Relearning}`.
- `history[]` is a runtime projection hydrated from canonical schema-v20 `reviewHistory` rows;
  schema v26 Card rows and current portability payloads store it as an empty array. It contains
  `ReviewLog` entries (timestamp, grade, responseTimeSec, distracted,
  stability/difficulty before+after, retrievabilityAtReview|null, session/revision provenance,
  and optional legacy machine-awarded `marksEarned`/`marksAvailable`, line verdicts and checker
  disputes for structured Cards that pre-date v24).
- Teaching state is intentionally absent from `Card`; it is lesson-specific and lives in
  `LessonCardExposure`.

### SessionHistoryEntry

`{ id?, eventId?, sessionId?, revisionPlanId?, revisionWindowId?, timestamp, deckId, courseId?,
averagePredictedRetrievability }` — the current review path samples asynchronously at most once per
local calendar day per review unit. Legacy and imported databases may contain per-answer rows.
Analytics traverses every retained row but materialises only the last sample per local day for a
Course chart, and the last sample per local day and Course for the global chart. The underlying rows
remain unpruned. Event/session and revision fields preserve ordinary and assessment-revision
provenance.

### UserPerformance (transitional calibration profile)

`{ deckId, courseId?, runningMeanResponseTime, runningStdDevResponseTime, m2,
totalCorrectReviews }` — a Welford running mean/variance over **correct (Yes) reviews only**,
used to calibrate the invisible grader. Course-scoped review writes the course identity;
legacy/deck-shaped reads remain during the staged Course/Deck migration, so the storage shape
must not yet be treated as a settled scientific claim about the right calibration scope.

### MediaAsset / BackupAsset

- `MediaAsset { hash, blob, mimeType, kind?, width?, height?, createdAt }` — a card image or
  audio clip stored
  as a **`Uint8Array`** in the `assets` table, keyed by the SHA-256 of its bytes so
  identical media is stored once. `kind` is absent on pre-Arc-6 records and therefore means
  image; audio records use `kind: 'audio'` and omit dimensions. (`Blob | Uint8Array` in the type for backward
  compatibility, but the implementation always stores `Uint8Array` for cross-environment
  consistency, including `fake-indexeddb`.) Card Markdown carries only a
  `lacuna-asset://<hash>` reference, resolved to an object URL at render time via
  `toBlob()` and held in a bounded 200-entry LRU cache. Eviction revokes the old URL, and
  app teardown revokes all remaining URLs. This keeps reactive card reads small, stops base64
  inflating exports and quota, and avoids the create/revoke churn on every card flip during a
  fast Learn session.
- `BackupAsset { hash, data(base64), mimeType, kind?, width?, height?, createdAt }` — the
  JSON-safe form of a `MediaAsset` carried in backup/export files.

### BackupSnapshot / BackupFile / AppStateEntry

- `BackupSnapshot { id?, createdAt, tag?, deckCount, cardCount, payload }` — a stored
  automatic restore point (denormalised counts so the list renders without parsing the
  payload). `tag = 'pre-migration'` marks a snapshot taken automatically before a schema
  upgrade; these are **exempt from daily-snapshot pruning** so a botched migration always
  has a fallback (§13).
- `BackupFile { app:'lacuna', version, exportedAt, decks?, cards, reviewHistory?, assets,
sessionHistory, userPerformance, folders?, courses?, lessons?, notes?, lessonCards?,
lessonCardExposures?, lessonCompletions?, practiceNodes?, practiceMilestones?,
courseAssessments?, revisionPlans?, sequences?, occlusions?, concepts, questions,
questionConcepts, questionAttempts, courseExamDates? }` — the
  shape of both manual exports and snapshot payloads. `decks` and `folders` are legacy optional
  fields retained only so non-empty pre-v22 rows can be rejected; current exports do not emit
  them. Current exports include canonical
  `reviewHistory`, `courseAssessments`, `revisionPlans`, `sequences`, `occlusions` and all four
  Question collections. Current `cards` carry an empty `history` projection; legacy inline history
  remains accepted and is normalised into `reviewHistory` before storage. The
  legacy `courseExamDates` field is accepted for old imports but is never emitted. `noteAnnotations`
  and lineage merge state are deliberately absent. `version` is the portability format version
  (currently 11), not the Dexie schema version. Current exports require the Question arrays; older
  backups are normalised through the pure v24 converter before import, but non-empty legacy Deck
  or Folder rows are refused.
- `AppStateEntry { key, value }` — small persistent app state (e.g. the backup folder
  handle, sidebar settings, input mode, motion speed).


[Specification index](../SPEC.md)
