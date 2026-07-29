# Arc 6 — Media Card Types: Audio and Image Occlusion (detailed)

> Supersedes the Arc 6 outline in `next_plan.md` for implementation purposes. UI directions
> were mocked, reviewed and chosen before this plan was written: see
> [`mockups-audio.html`](./mockups-audio.html) and
> [`mockups-occlusion.html`](./mockups-occlusion.html) in this folder. Chosen directions:
> **A1** (audio study), **C2** (audio editor), the **label-box occlusion model** (study),
> and **D1 adapted** (occlusion editor).

## 6.1 Motivation and positioning

The outline deferred this arc pending Arc 2's plugin-extension-point decision. Arc 2
shipped and deferred every extension point, so both types are built natively, as the
outline anticipated. Audio serves language and dictation work and closes an existing
import bug (§6.7). Occlusion serves diagram recall, which is a large share of GCSE biology
and geography marks and is the one card shape Lacuna currently cannot express at all.

## 6.2 Architectural decisions

**Audio is a Markdown asset embed, not a card type.** `Card.type` stays at its three
values. An audio card is an ordinary `front_back` card whose `front` contains an asset
reference, so rendering, search, duplicate detection, share codes, lineage diffing and the
MCP card tools need no new cases. The structured editor (§6.5) writes this shape; the
author never sees the Markdown unless they open the raw editor.

**Consequence, accepted deliberately:** playback behaviour cannot be per-card, because
there is nowhere on an ordinary card to store it. Autoplay-on-reveal and default playback
speed become global settings. A per-card replay limit is the kind of setting an author sets
once, wrongly, and never revisits, so this is judged a feature rather than a cost. If
per-card playback is ever wanted, audio needs a payload and this decision reverses.

**Occlusion follows the Sequence precedent, not Arc 11's `payload`.** An earlier reading
of this arc favoured `payload.kind: 'occlusion'` to inherit Arc 11's versioning and
fallback. That is wrong for the same reason sequences are not payloads: occlusion regions
must survive editing, which means regeneration that preserves FSRS memory state per region,
which needs an owning authoring entity to regenerate _from_. `payload` has no owner.
So: a new `occlusions` table, generated read-only `Card` rows anchored by a stable region
id, and regeneration routed through the existing `diffRegeneration` contract in
`src/db/sequenceGeneration.ts` (content only, never scheduling fields).

**A region carries a role, and one image produces two card kinds.** The two ways of
testing a diagram are one data shape:

- A **label** region covers text already printed on the diagram. Revealing it uncovers the
  diagram's own pixels, so the author types nothing.
- A **feature** region points at a part of the drawing. Its answer is the _paired_ label
  region, uncovered on the back.

Both kinds mask every label region on the front, without exception. A feature card that
left labels visible would be answerable by reading the picture, and a label card that left
its siblings visible is answerable by elimination.

**Masks are stored as fractions of the image**, never pixels, so they hold position under
`FlipCard`'s responsive sizing and at any zoom. This is a UI decision with a data
consequence and is the single easiest thing in this arc to get wrong late.

**V1 product defaults (approved 29 July 2026).** Occlusion regions ship as rectangles, but
persist `shape: 'rectangle'` so later geometry does not require guessing what old records
meant. Every label is masked; there is no target-only author option in v1. Occlusion images
use a 2560px longest-edge ceiling. The editor is explicitly desktop-first: touch remains
functional but receives no dedicated optimisation in this arc. Audio accepts MP3, M4A/MP4,
Ogg, WAV and WebM files up to 25 MB each.

## 6.3 Data model

**Assets widen in place, with no migration.** The `assets` table keeps its name and its
`hash` index; `ImageAsset` becomes `MediaAsset` with `width`/`height` optional and a new
optional `kind: 'image' | 'audio'` (absent means image, which is every existing row). Dexie
stores records without a per-field schema, so adding optional fields needs no version bump.
`storeImageBlob` gains a sibling `storeAudioBlob` that skips `compressImageBlob` entirely;
audio is stored as uploaded, subject to a size ceiling decided in Task 1.

**Occlusion entity (schema v19, additive):**

```ts
interface OcclusionRegion {
  id: string; // stable across edits; anchors one generated card
  role: 'label' | 'feature';
  shape: 'rectangle'; // v1 only; explicit for forward-compatible geometry
  x: number;
  y: number; // fractions of image width/height, 0..1
  w: number;
  h: number;
  answerText?: string; // optional; required only for typed mode and unpaired features
  pairedRegionId?: string; // feature -> the label region that answers it
  backNote?: string; // optional extra shown on the back
}

interface Occlusion {
  id: string;
  courseId: string;
  primaryLessonId: string | null; // same semantics as Card.primaryLessonId
  name: string;
  assetHash: string; // the diagram
  regions: OcclusionRegion[]; // inline; occlusions are small
  createdAt: number;
}
```

`Card` gains one optional field, mirroring `sequenceItemId`:

```ts
occlusionRegionId?: string;   // present iff generated from an occlusion region
```

New table: `occlusions: 'id, courseId, primaryLessonId, createdAt'`, plus an
`occlusionRegionId` index on `cards`. Additive only; no existing data changes.

## 6.4 Card generation rules

One card per region, both roles included. For a region `r` in occlusion `o`:

- **Front** renders `o.assetHash` with every `role: 'label'` region masked. If `r.role` is
  `label`, `r` is additionally ringed as the target. If `r.role` is `feature`, `r` is ringed
  and no extra masking applies.
- **Back** is the same image with one mask lifted: `r` itself for a label region, or
  `r.pairedRegionId` for a feature region. An unpaired feature region shows `answerText`
  instead. `backNote` renders below the image where present.
- `Card.front`/`Card.back` carry a plain-text fallback (`"Label 3 of 6 — Plant cell"`) so
  search, the card list preview and any client that cannot render an occlusion degrade to
  something legible rather than blank.
- **Regeneration on edit**, per §6.2's `diffRegeneration` contract: moving or resizing a
  region rewrites that card's presentation and keeps its memory state; deleting a region
  deletes its card under the standard undo pattern; adding one creates a card. Changing
  `role` or `pairedRegionId` regenerates the affected card only. Replacing the image
  regenerates every card in the occlusion and must warn first.
- Generated cards are read-only in the card editor, badged, and deletable only via the
  occlusion, matching the sequence conventions exactly.

## 6.5 UI

**Audio study (A1).** The player renders inline wherever the embed sits in the front. The
back renders `card.back` only, so the player disappearing needs no special case. Un-flip is
a presentation-only toggle returning to the front face: the reveal latches, so grading stays
available and the response timer is untouched. Its keyboard binding must be chosen against
the existing map in `useLearnKeyboardShortcuts.ts` (`h` is taken by hints).

**Audio editor (C2).** A structured form (audio slot with replace/record, optional prompt,
required answer) writing the A1 storage shape. Playback settings live in global Settings.

**Occlusion study.** Per the mockup: masked labels, ringed target, click or keyboard to
reveal, ordinary grade row. Typed mode is offered only where `answerText` exists.

**Occlusion editor (D1 adapted).** Two draw tools (label box, feature), a region list with
role chips and inline pairing, a detail pane for role/answer text/back note, and a live
generated-card count in the footer following the sequence editor's precedent. Region names
default to `Box 1…n` so the list is navigable with no typing. Layout stacks below 760px;
drawing on touch is supported but not optimised (§6.9).

## 6.6 Distribution: the honest-failure decision

`stripAssetMedia` replaces every asset reference in a share code with placeholder text
under a 5MB cap, so **no occlusion or audio card can be distributed today**, and an
occlusion card without its image is worthless rather than degraded. Backups carry assets
properly (`BackupFile.assets`), so this is a share-code and published-lineage problem only.

Solving asset transport properly means either a companion asset file alongside the share
code or the Arc 12 relay, and both are larger than this arc. **Decision: v1 is local and
backup only, and the failure is made loud rather than silent.** Publishing or exporting a
course containing media cards warns, names the affected cards, and states that recipients
will receive an unusable placeholder. One small task, no new transport. Asset-bearing
distribution is Arc 12's problem, and this arc's warning copy is the thing that stops a
teacher discovering the gap from a confused student.

## 6.7 Portability, MCP and the Anki import bug

- Occlusions ride export/import/backup/diagnostics like sequences did (same additive
  pattern; older backups without the array still import). Share codes carry them, subject
  to §6.6's warning.
- `LineageCardSnapshot` and `lineageDiff` treat occlusion-generated cards the way they
  already treat sequence cards: routed to regeneration, never diffed directly.
- MCP gains `create_occlusion`/`update_occlusion`/`delete_occlusion` and
  `list_occlusions`/`get_occlusion`, following Arc 2's conventions. Additive tools, so no
  `MCP_TOOL_SURFACE_VERSION` bump. An agent authoring an SVG diagram plus fractional region
  coordinates is a text-only workflow that sidesteps §6.6 entirely, which is worth noting
  as the most promising authoring path once it exists.
- **Incidental bug, fixed here:** `apkgImport.ts:696` drops every non-image media file, so
  Anki audio silently vanishes, and `guessMimeType`'s `mp3`/`ogg`/`wav` entries are
  vestigial. With audio assets existing, that branch admits audio, and Anki's
  `[sound:file.mp3]` syntax is rewritten to an asset embed. Committed separately per house
  convention.

## 6.8 Testing

- `src/db/occlusionGeneration.ts` — pure, exhaustively tested before any UI, mirroring
  `sequenceGeneration`'s suite: both roles, pairing, unpaired features, mask sets per card,
  and regeneration diffs (move, resize, delete, role change, image replace) asserting FSRS
  fields are never written.
- Fraction-coordinate round-trip: a region drawn at one container size resolves to the same
  relative position at another.
- `src/db/assets.ts` — audio store/retrieve/GC, and that image behaviour is unchanged.
- Occlusion renderer and editor — component tests with a fixture occlusion.
- `apkgImport` — a fixture deck containing an audio file.
- Share/backup round-trips for both types, including the §6.6 warning path.
- Manual pass: a real labelled diagram, both card kinds, light and dark, touch and
  keyboard, web and Electron.

## 6.9 Task list

One subagent, one commit, tests alongside.

1. **Audio assets.** `MediaAsset` widening, `storeAudioBlob`, size ceiling, GC coverage.
2. **Audio rendering.** Player component, embed recognition in `MarkdownView`, `CardContent`
   left untouched where possible.
3. **Flip and un-flip.** Un-flip as a latched presentation toggle in `FlipCard`, keyboard
   binding chosen against the existing map, grading and timing provably unaffected.
4. **Audio editor (C2)** plus the two global playback settings.
5. **`apkgImport` audio fix.** Separate commit, per house convention.
6. **Schema v19 and occlusion types.** Additive migration with a pre-migration snapshot test.
7. **`occlusionGeneration.ts`.** Pure module, full test suite, no UI. Must land before
   anything calls it.
8. **Occlusion repository** with snapshot/undo and cascade deletes, following
   `sequenceRepository`.
9. **Occlusion renderer** (study front/back, masks, reveal, typed mode where available).
10. **Occlusion editor (D1 adapted).**
11. **Read-only enforcement and badging** across card editor, card list, question bank,
    search and command palette. Audit every `sequenceItemId` call site as the checklist.
12. **Portability and MCP tools**, including §6.6's export/publish warning.
13. **Documentation and manual pass.** `SPEC.md`, `CHANGES.md`, Help; flip this plan's
    status line.

## 6.10 Open questions

Recorded so this cannot be mistaken for finished design.

1. **Label-card masking default — resolved.** Every label is masked; v1 has no target-only
   author option.
2. **Feature-region shape — resolved.** V1 renders rectangles only and stores
   `shape: 'rectangle'` from the first schema version.
3. **Grouping.** One card per group of regions ("name the three organelles") was mocked as
   D4 and is deferred. Adding it later means a new optional `groupId`, so nothing is
   foreclosed.
4. **Diagram image ceiling — resolved.** Occlusion images use their own 2560px longest-edge
   ceiling so small printed labels survive compression.
5. **Touch authoring — resolved.** Authoring is desktop-first. Drawing with a finger remains
   functional but is not separately optimised in v1.

## 6.11 Out of scope

- Asset-bearing distribution (§6.6). Arc 12.
- Video, and any card type beyond these two.
- Per-card playback settings (§6.2).
- OCR of label text. Offline constraint, and the pairing model removes the need.
- A structure-aware image editor: no cropping, rotation, or drawing on the diagram itself.
- Region grouping (§6.10.3).
- Any change to `src/fsrs/` scheduling logic.

## 6.12 Success criteria

1. An audio card authors through C2, stores as an ordinary `front_back` card with an asset
   embed, flips with the player disappearing, un-flips without affecting the grade or timer,
   and works in typed mode against its back.
2. A labelled diagram produces one card per label box with no answer text typed by the
   author, and feature cards answer by uncovering their paired label.
3. Editing a region preserves that card's FSRS memory state; deleting one removes its card
   with undo; replacing the image warns before regenerating everything.
4. Masks hold their position at every viewport size and in both themes.
5. Generated occlusion cards are read-only and badged at every card surface, verified by
   auditing the `sequenceItemId` call sites.
6. Exporting or publishing a course containing media cards warns explicitly and names the
   affected cards.
7. An Anki deck containing audio imports with playable audio.
8. All tests pass; `tsc -b` clean; `SPEC.md` and `CHANGES.md` accurate.
