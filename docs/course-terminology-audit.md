# Course-facing Deck terminology audit

**Reviewed:** 12 August 2026
**Scope:** Course-reachable export, share and import paths in `src/db/share.ts`,
`src/db/portability.ts`, `src/db/export.ts`, `src/db/mergeImport.ts` and
`src/components/import/`, plus the Course-facing callers needed to trace them.

The product model is Course → Lesson → Note + Card. This audit does not treat every
`Deck` token as a defect. A stored backing Deck is still the scheduler's unit, and old
share/backup formats still contain Deck-shaped data.

## Result and counting rule

The classifications below contain **10 wire-format entries (A), 8 internal-scheduling
entries (B), and 10 safe-rename entries (C)**. A category C pass would touch **66 code update
sites** across declarations, producers, local bindings, consumers, tests and fixtures. The
count includes every source location that would need editing for the proposed rename; fixture
fields whose value is already `course` and therefore needs no edit are listed as checked but are
not counted. The count treats the same spelling in different roles as different qualified
identifiers: for example, `BackupFile.decks` is a wire field, while `db.decks` is a storage
table.

No source code was changed by this audit. No wire-format rename is proposed.

## Caller paths audited

- `src/pages/SharePage.tsx:213-245,305-335` generates and imports Course share codes.
  Its `buildCourseShareCode` path is already Course-neutral; its import path accepts both
  v2 Course payloads and legacy v1 Deck payloads.
- `src/components/course/NewCourseForm.tsx:14-17,221-228` reaches the share-only
  `ShareCodeImportPanel`, which is backed by `UnifiedImportPanel` and can receive a v1
  code through the Course creation flow.
- `src/components/cards/CardList.tsx:500-512` reaches `UnifiedImportPanel` from both
  legacy Deck callers and the Course/Lesson `CardListContext` branch. The Course branch
  passes a backing-deck id only for duplicate detection.
- `src/pages/settings/DataPortabilitySection.tsx:18-30,55-58` reaches
  `UnifiedExportPanel` and `importBackup` for full Course-inclusive backups.
- `src/pages/Settings.tsx:64-65` renders the global `BackupsSection`; its restore-point count is
  checked separately below because it is derived from backing Deck rows.
- `src/components/import/UnifiedExportPanel.tsx:134-176` calls the generic card and
  review exporters and `downloadBackup`.
- `src/components/import/MergeReviewPanel.tsx:1-5,240-245,356-364` is a Course-scoped
  caller of the merge-review operations in `src/db/mergeImport.ts`.

## A — Wire format: must not change

These names are in a serialised share code, backup file, or imported file contract. The
trace under each entry reaches an actual encoder, parser, or file reader. They are not
Course terminology fixes.

### A1. v1 share payload: `decks` and the `ShareDeck` shape

- **Identifiers:** `ShareDeckSchema`, `ShareDeck`, `SharePayloadV1.decks`, and the v1
  payload's compact fields (`n`, `o`, `c`, `e`, `r`, `p`, `l`, `cards`).
- **Locations:** `src/db/share.ts:177-186,297-302,351-360,459-467`.
- **Serialisation trace:** `buildSharePayload` creates the `decks` array at
  `src/db/share.ts:803-825`; `encodeShareDirect` passes that payload to the codec at
  `src/db/share.ts:513-515`; `src/db/shareCodec.ts:63-69` runs `JSON.stringify` before
  applying the LAC encoding.
- **Parse trace:** `src/db/shareCodec.ts:81-110` decodes and runs `JSON.parse`, then
  `src/db/share.ts:533-542` validates the result with `SharePayloadSchema`; the v1
  validator requires `decks` at `src/db/share.ts:297-302`.

The type names are code representations of this legacy wire shape. The immutable wire
identifier is the payload key `decks`, not a proposed Course name. Preserve the whole v1
shape for LAC0–LAC3 compatibility. `buildSharePayload` and the exported
`buildShareCode(deckIds)` are the retained producers for this contract. The `deckIds`
parameter itself is **unverified as a wire identifier**: it is consumed to query `db.decks`,
but only the returned `decks` property is serialised. The producer and its compatibility tests
must remain; no removal is proposed.

### A2. Full-backup top-level `decks` and Deck-shaped records

- **Identifiers:** `BackupFile.decks`, the `Deck` record shape, `LegacyDeck` migration
  input, and the `decks` property emitted by `exportDatabase`.
- **Locations:** `src/db/types.ts:982-1000`; `src/db/portability.ts:55-128,148-171,182-190`.
- **Serialisation trace:** `exportDatabase` reads `db.decks` and returns `decks` at
  `src/db/portability.ts:56-77,105-128`; `downloadBackup` serialises the returned object
  with `JSON.stringify` at `src/db/portability.ts:131-145`.
- **Parse trace:** `readBackupFile` runs `JSON.parse` at `src/db/portability.ts:685-692`,
  and `validateBackup` requires an array at `src/db/portability.ts:148-171`. Import then
  migrates each incoming record through `migrateDeckRecord` at
  `src/db/portability.ts:182-190`.

Changing `decks` to `courses` would make old backup files invalid or silently incomplete.
The physical Deck records remain part of the compatibility and scheduling bridge.

### A3. Deck-keyed fields inside backup records

- **Identifiers:** `Card.deckId`, `SessionHistoryEntry.deckId`, `UserPerformance.deckId` and
  canonical `ReviewHistoryEntry.deckId` when they travel inside a `BackupFile`.
- **Locations:** `src/db/types.ts:842-850,905-923,981-992`; `ReviewHistoryEntry` is defined
  at `src/db/reviewHistory.ts:7-14`; the merge/restore uses are visible in
  `src/db/portability.ts:231-234,632-680`.
- **Serialisation/parse trace:** these records are members of the object returned at
  `src/db/portability.ts:105-128`, written by `JSON.stringify` at line 134, read by
  `JSON.parse` at line 688, and restored/merged from `backup.userPerformance`,
  `backup.sessionHistory` and `backup.reviewHistory` at
  `src/db/portability.ts:231-234,635-680,579-591`.

`UserPerformance.deckId` is especially unsafe to rename: the transitional table can carry
  either a backing-Deck key or a Course review-unit key. The ambiguity is a storage decision
  already documented in `docs/course-domain-boundary-follow-ups.md`; it is not permission to
  alter the backup contract. Canonical review history also inherits `ReviewLog.sessionKind`; its
  legacy `'deck'` value is emitted by the review-history exports below and remains part of the
  compatibility surface.

### A4. Card CSV/TSV headers: `deck_name` and `deck_colour`

- **Identifiers:** the string fields `deck_name` and `deck_colour` in `EXPORT_HEADERS` at
  `src/db/export.ts:68-84`.
- **Serialisation trace:** the headers are emitted by `exportCardsCsv` and
  `exportCardsTsv` through `formatRow` at `src/db/export.ts:116-134`; the Course-aware
  display value is inserted by `cardToRow` at `src/db/export.ts:86-110`.
- **Caller trace:** `UnifiedExportPanel` downloads these exact strings at
  `src/components/import/UnifiedExportPanel.tsx:141-149`.

These are file headers, not Course-screen copy. Keep them stable for spreadsheet and
re-import consumers.

### A5. Plain-text export marker: `Deck:`

- **Identifier:** the serialised line prefix `Deck:` at `src/db/export.ts:142-146`.
- **Serialisation trace:** `exportCardsPlainText` appends the line to each emitted record
  and returns the file at `src/db/export.ts:137-159`; the panel downloads it at
  `src/components/import/UnifiedExportPanel.tsx:161-164`.

`Unknown deck` at `src/db/export.ts:142` belongs to this same downloaded-file contract. It
is not a Course-facing screen string.

### A6. Markdown export column: `Deck`

- **Identifier:** the Markdown header `| Deck |` at `src/db/export.ts:193-196`.
- **Serialisation trace:** the header and rows are returned by
  `exportCardsMarkdownTable` at `src/db/export.ts:193-204`; the file is downloaded by
  `UnifiedExportPanel` at `src/components/import/UnifiedExportPanel.tsx:151-154`.

### A7. Card JSON export property: `deck`

- **Identifier:** the JSON property `deck` at `src/db/export.ts:215-224`.
- **Serialisation trace:** each item is constructed with `deck` at line 221 and the array
  is serialised with `JSON.stringify` at line 224; `UnifiedExportPanel` downloads it at
  `src/components/import/UnifiedExportPanel.tsx:156-159`.

### A8. Review-history CSV headers and compatibility values

- **Identifiers:** `deck_name` and `session_kind` in `REVIEW_HISTORY_HEADERS` at
  `src/db/export.ts:231-252`; `session_kind` can contain the legacy `'deck'` value from
  `ReviewSessionKind` at `src/db/types.ts:55-69`.
- **Serialisation trace:** the header is emitted at `src/db/export.ts:270-302`, with the
  resolved Course/Lesson display value in the `deck_name` column at lines 274-284 and the
  session value at lines 277-284. The panel downloads it at
  `src/components/import/UnifiedExportPanel.tsx:166-169`.

### A9. Review-history JSON properties and compatibility values

- **Identifiers:** the JSON properties `deck` and `sessionKind` at `src/db/export.ts:305-336`;
  `sessionKind` can contain the legacy `'deck'` value.
- **Serialisation trace:** each review item receives `deck` at line 319 and the array is
  serialised at line 336; `sessionKind` is inserted at line 315. The panel downloads it at
  `src/components/import/UnifiedExportPanel.tsx:170-173`.

### A10. Anki APKG source-deck import payload

- **Identifiers:** the external `decks` table and its source-deck `name` field in the APKG
  import payload.
- **Import trace:** the APKG reader queries the source SQLite payload's `decks` table at
  `src/db/apkgImport.ts:388-396`; `extractFromDatabase` selects the first source deck at
  `src/db/apkgImport.ts:214-217` and returns its name at `src/db/apkgImport.ts:273-279`.

This is Anki source vocabulary, not a Lacuna Course field. It must not be presented as
evidence that the Course model has a Deck. The raw table and column are part of the external
import contract. `ApkgImportResult.deckName` is not part of this A entry: it is an in-memory
adapter field, listed under C10 because it can be renamed without changing the APKG payload.

## B — Internal scheduling: correct as named

These identifiers reach Course-facing callers, but the value really is the hidden or legacy
Deck-shaped scheduling/storage unit. Renaming them to Course would make the scheduler and
compatibility bridge less truthful.

### B1. v1 share import's legacy Deck records

`src/db/share.ts:47,1081-1116,1122-1138` imports the v1 payload into `Deck` records,
keeps `db.decks` in the transaction, and uses `courseIdByDeckId` and
`lessonIdByDeckId` to fold those records into Course/Lesson rows. The v1 payload has no
stored deck id (`ShareDeckSchema` at `src/db/share.ts:177-186`), so these are newly created
compatibility/scheduling records, not wire fields.

### B2. Course share import's `deckId` and `bankDeckId`

`src/db/share.ts:1291-1323` obtains `deckId` and `bankDeckId` from
`ensureLessonBackingDeck` and `ensureCourseBankBackingDeck`. Those helpers explicitly
resolve hidden scheduling rows at `src/db/backingDecks.ts:258-309,313-357`. The ids are
written to the local Card records for FSRS and persistence; they do not come from the v2
share payload.

### B3. Portability's physical Deck-table merge

The `db.decks` transaction/clear/restore operations at
`src/db/portability.ts:77,256-303,360-382`, plus `existingDecks`, `mergedDecks` and
`remoteDeck` at `src/db/portability.ts:360-382,642-659`, operate on the retained physical
Deck table. Course backups still carry those rows because the scheduler and migration
bridge need them. The same module's `backup.decks` and nested `deckId` fields are A when
they cross the file boundary; this B entry is only the local table operation.

### B4. Export fallback maps and `c.deckId`

`fetchDecksAndCards` builds `deckMap` and `colourMap` from `db.decks` at
`src/db/export.ts:27-40`. `resolveDeckDisplay` gives Course/Lesson names precedence at
lines 56-63, then falls back to `c.deckId` at line 65 for legacy deck-only cards. That
fallback is genuinely reading a stored Deck grouping, not pretending that the Course id is
a Deck id.

### B5. Merge import's Deck transaction and card storage ids

`MERGE_TABLES` includes `db.decks` at `src/db/mergeImport.ts:305-323`. Course lineage
creates obtain a backing id at `src/db/mergeImport.ts:465-493`, and first lineage imports
do the same at `src/db/mergeImport.ts:585-649`. The `deckId` fields written there are
hidden scheduling ownership on local Cards, not v2 payload fields.

### B6. `UnifiedImportPanelProps.deckId`

- **Location:** `src/components/import/UnifiedImportPanel.tsx:43-60,177-186`.
- **Use:** `src/components/import/UnifiedImportPanel.tsx:229-251` passes the id to
  `checkDuplicatesBatch`.
- **Course caller:** `src/components/cards/CardList.tsx:506-512` passes
  `context.importTargetId` in the Course/Lesson branch; `context.importTargetId` is
  explicitly documented as a backing-deck id at `src/components/cards/cardListContext.ts:18-23`
  and is set from `schedulingConfig.id` at lines 43-51.

This prop is badly named only if its value is assumed to be Course data. Its actual value
is the hidden scheduling destination used to query duplicate Cards, so it is B, not a safe
Course-id rename. A clarifying comment may be useful in a later change.

### B7. Backing-deck adapter names

`ensureLessonBackingDeck` and `ensureCourseBankBackingDeck` are imported and called from
the Course share/import paths at `src/db/share.ts:35-38,1291-1321` and
`src/db/mergeImport.ts:35-46,467-470,590-598`. The names state exactly what the helpers
resolve. They are not leaked Course-facing API names.

### B8. APKG legacy target-deck option

`ApkgParseOptions.deckName` at `src/db/apkgImport.ts:34-39` is an explicit name for the
physical target Deck used by the legacy APKG path. The Course-facing importer calls
`parseApkg` with only `{ importScheduling: true }` at
`src/components/import/UnifiedImportPanel.tsx:318`; no Course caller supplies this override.
It is therefore not a Course name to rename. The separate result field shown in the Course
import preview is `ApkgImportResult.deckName`, which is the safe adapter rename in C10.

## C — Safe rename: code-facing names that misdescribe Course data

These names are not serialised fields and do not change storage. The following is the
complete rename inventory. The update-site lists include declarations, producers, local
bindings, consumers, tests and fixtures; no rename has been applied.

### C1. Legacy summary discriminator

- **File/lines:** `src/db/share.ts:499,708`.
- **Current name:** `ShareSummary.kind: 'deck' | 'course'`, with the v1 value `'deck'`.
- **Proposed name:** keep `kind`, change the legacy value from `'deck'` to `'legacy'`.
- **Update sites:** `src/db/share.ts:499,708` and `src/db/share.test.ts:77`.
- **Checked, no edit required:** the production callers at `src/pages/SharePage.tsx:820` and
  `src/components/import/UnifiedImportPanel.tsx:969` only test for `'course'`; the fixtures at
  `src/pages/SharePage.test.tsx:45`,
  `src/components/import/UnifiedImportPanel.test.tsx:40` and
  `src/components/import/ShareCodeImportPanel.test.tsx:26` also use `'course'`.

The value is a derived preview discriminator, not a share-code field. The v1 wire remains
`v: 1` with `decks`.

### C2. `ShareSummary.deckCount`

- **File/lines:** `src/db/share.ts:500,690,709`.
- **Current name:** `deckCount`.
- **Proposed name:** `groupCount` (v1 legacy groups and v2 lessons share this preview slot).
- **Update sites:**
  - `src/db/share.ts:500,690,709`;
  - `src/pages/SharePage.tsx:834,835`;
  - `src/components/import/UnifiedImportPanel.tsx:983,984`;
  - `src/db/share.test.ts:78,165`;
  - `src/pages/SharePage.test.tsx:46`;
  - `src/components/import/UnifiedImportPanel.test.tsx:41`;
  - `src/components/import/ShareCodeImportPanel.test.tsx:32`.

The v2 implementation currently fills this field from `payload.lessons.length` at line
690. That is direct evidence that `deckCount` is the wrong code-facing name for Course
previews.

### C3. `ShareSummary.deckNames`

- **File/lines:** `src/db/share.ts:503,693,702-704,712`.
- **Current name:** `deckNames`.
- **Proposed name:** `groupNames`.
- **Update sites:**
  - `src/db/share.ts:503,693,702,704,712`;
  - `src/pages/SharePage.tsx:842,844`;
  - `src/components/import/UnifiedImportPanel.tsx:991,993`;
  - `src/db/share.test.ts:166`;
  - `src/pages/SharePage.test.tsx:49`;
  - `src/components/import/UnifiedImportPanel.test.tsx:44`;
  - `src/components/import/ShareCodeImportPanel.test.tsx:33`.

The v2 implementation fills it from lesson names at `src/db/share.ts:675-693`. This is a
preview API leak, not a wire-format leak.

### C4. `importDeckSharePayload`

- **File/lines:** `src/db/share.ts:1088`.
- **Current name:** `importDeckSharePayload`.
- **Proposed name:** `importLegacySharePayload`.
- **Update sites:** `src/db/share.ts:1088,1483`.

The function is a retained compatibility adapter and must remain. Only its private code
name is a safe rename: it accepts the v1 Deck payload but creates Course/Lesson rows and
returns `ImportShareResult`.

### C5. `fetchDecksAndCards`

- **File/lines:** `src/db/export.ts:27`.
- **Current name:** `fetchDecksAndCards`.
- **Proposed name:** `fetchExportData`.
- **Update sites:** `src/db/export.ts:27,52,87,89,117,129,138,194,216,271,307`.

The helper fetches Decks, Cards, Courses and Lessons and prefers Course/Lesson display data.
Its current name is incomplete for the Course-aware export path and has no wire effect.

### C6. `resolveDeckDisplay`

- **File/lines:** `src/db/export.ts:43-66`.
- **Current name:** `resolveDeckDisplay`.
- **Proposed name:** `resolveCardGroupingDisplay`.
- **Update sites:** `src/db/export.ts:49,93,141,198,221,274,310`.

The function resolves `Course — Lesson`, Course-only, and legacy Deck-only names. Calling
the whole operation Deck display is precisely the terminology leak this audit is meant to
record.

### C7. Export-local `deckName`

- **File/lines:** `src/db/export.ts:142,274,310`.
- **Current name:** `deckName`.
- **Proposed name:** `displayName`.
- **Update sites:** `src/db/export.ts:142,145,274,284,310,319`.

The value is already a Course/Lesson display name for Course cards. The serialised `Deck:`
line and JSON `deck` property listed in A5 and A7 would remain unchanged.

### C8. Export-local `deckColour`

- **File/lines:** `src/db/export.ts:143`.
- **Current name:** `deckColour`.
- **Proposed name:** `displayColour`.
- **Update sites:** `src/db/export.ts:143,146`.

The value is already selected from either Course or legacy Deck metadata. The output value
and its position in the CSV/TSV contract remain unchanged.

### C9. Markdown export-local `deck`

- **File/lines:** `src/db/export.ts:198`.
- **Current name:** local `deck` variable.
- **Proposed name:** `displayName`.
- **Update sites:** `src/db/export.ts:198,202`.

This local contains the result of `resolveDeckDisplay`, including Course/Lesson names. The
serialised Markdown header remains `Deck` under A6.

### C10. APKG result adapter field

- **File/lines:** `src/db/apkgImport.ts:24,217,274,702`.
- **Current name:** `ApkgImportResult.deckName` (with the local source name at line 217).
- **Proposed name:** `sourceDeckName`.
- **Update sites:** `src/db/apkgImport.ts:24,217,274,702`;
  `src/components/import/UnifiedImportPanel.tsx:779`;
  `src/components/cards/CardList.test.tsx:88,240`; and
  `src/db/apkgImport.test.ts:49`.

This is an in-memory adapter field, not an APKG key and not a Lacuna backup/share field. The
rename would make the Course-facing preview's external Anki provenance explicit without
changing the source payload, IndexedDB schema or legacy target-Deck behaviour.

## User-visible `deck` strings on Course-facing screens

These are copy defects, not rename instructions. They are listed separately from C, and no
code change is made here.

1. **Legacy share preview:** `src/components/import/UnifiedImportPanel.tsx:980-988`
   renders “This code contains N deck(s)”. The component is reached from the Course share
   importer at `src/components/course/NewCourseForm.tsx:221-228`; v1 imports become a
   Course with one lesson per legacy Deck. The copy should say “lesson(s)” in this
   Course-facing preview.
2. **Course/Lesson card editor:** `src/pages/CardEditor.tsx:67-86,670-682` renders
   “A card with identical content already exists in this deck.” on Course and question-bank
   routes. The copy needs a Course/Lesson-aware noun rather than “deck”.
3. **Course settings, new-card cap:** `src/pages/settings/SchedulingFieldsSection.tsx:118-122`
   says “a large deck does not overwhelm you”. The component is rendered by the Course
   settings page at `src/pages/CourseSettings.tsx:382-384`; this should refer to the course
   or study scope.
4. **Course settings, review cap:** `src/pages/settings/SchedulingFieldsSection.tsx:137-140`
   says “for this deck”. It is the same Course settings caller at
   `src/pages/CourseSettings.tsx:382-384` and needs Course-aware copy.
5. **Legacy v1 import fallback name:** `src/db/share.ts:1090-1093` uses the stored fallback
   name “Shared deck” when a v1 payload has no name. `buildCourseMigration` then exposes
   that value as both the standalone Course and Lesson name at
   `src/db/courseMigration.ts:138-157`. This is not a literal JSX label, but it can surface
   as a Course-facing name after import and should be treated as copy debt separately from
   the A1 `decks` wire key.

Related Course-facing count defect without the literal word “deck”: automatic restore points
display `{backup.deckCount} lessons` at `src/pages/settings/BackupsSection.tsx:150-156`, but
`takeAutoBackup` derives that value from `payload.decks.length` at
`src/db/backups.ts:105-115`. The displayed lesson count can therefore count hidden backing
Decks rather than Course lessons. This is a data-label defect, not a wire rename.

Checked clean in the scoped surfaces: `SharePage` already labels the legacy preview as
“lesson” at `src/pages/SharePage.tsx:831-840`; `DataPortabilitySection` displays lesson
counts at `src/pages/settings/DataPortabilitySection.tsx:90-98`; `UnifiedExportPanel` has
no user-facing Deck label; and `MergeReviewPanel` uses Course, Lesson, Note and Card
labels only. `CourseSettings` passes `entityLabel="course"` to its optimisation panel at
`src/pages/CourseSettings.tsx:535-541`, so that path does not leak the panel's legacy
default. The Dashboard-only `src/pages/Welcome.tsx:710` “Import a deck” action and the
global/legacy Learn strings are outside the Course-facing screen set; their Deck wording is
not included as a copy defect here.

## Explicit non-findings

- `src/db/share.ts:1055-1062` exposes `buildCourseShareCode` and
  `buildCourseShareCodeQR`; neither has a Deck-named parameter.
- `UnifiedExportPanel` no longer has a `deckIds` or `showShareCode` prop. Its current
  heading-only API is Course-neutral, as recorded in the boundary follow-up.
- `src/db/mergeImport.ts` contains no Deck-shaped share-payload field. Its Deck names are
  local scheduling/storage bridges listed under B.
- `ShareDeck`, `LegacyDeck`, `db.decks`, `deckId`, `deckMap` and related local names are
  not blanket C candidates. Each occurrence was traced either to the A wire/compatibility
  boundary or to the B scheduling/storage bridge above.
