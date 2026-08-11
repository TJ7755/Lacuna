# Arc 14 — remaining flow repairs

**Status:** delivered 11 August 2026.

This plan closes the four flow-simplification slices left after course setup and study entry
points. It changes no scheduling semantics and adds no account, cloud, or integrated-AI claims.

## Delivered outcomes

### Practice-node management

- Manual-practice insertion is persistently labelled at every course-path boundary.
- Path nodes identify themselves as Automatic or Manual.
- The course path is the sole editor for manual practice. Course Settings explains the model,
  lists manual nodes, states that custom card filters are not authorable, and links to the path.

### Course navigation and authoring

- Path, Question bank, Analytics, and Settings remain available from normal and single-lesson
  views, with Path active for lesson routes.
- Empty and populated lesson surfaces and Question bank buckets use the same New card, New
  sequence, New occlusion, Link existing cards, and Import cards language where applicable.
- Card-import copy distinguishes text/CSV/JSON/APKG input from course sharing and full recovery.

### Sharing, recovery, and destructive actions

- Course sharing, plain-text card export, card/APKG import, full JSON backup, merge, and local
  replacement are named separately before the user commits data.
- Media-omitting share codes point directly to Full backup & recovery.
- External batch staging warns before discarding entered notes or staged candidates.
- Archived courses have a persistent dashboard section and Unarchive action.
- Course deletion and full-backup replacement require explicit consequence confirmation;
  replacement states that it affects this local installation, not a nonexistent account.
- Shortcut reassignment rejects a key already owned by another action.

### Consolidation and release gates

- Practice-node persistence and Learn card-capability decisions were extracted from oversized
  modules without changing their public contracts.
- Vitest is capped at one worker. Critical course-path, unlock, session, and lineage-diff modules
  have a targeted coverage gate of 92% statements/lines, 85% branches, and 99% functions.
- A one-worker Chromium production smoke suite covers first run, course creation, lesson course
  navigation, a real study interaction, and a full-backup download.
- CI now runs type checks, lint, the full unit suite, targeted coverage, production build,
  release scenario, and the browser smoke suite.

## Verification evidence

- Focused regression suite: 14 files, 123 tests passed.
- Targeted coverage suite: 4 files, 88 tests; 92.27% statements/lines, 85.34% branches,
  100% functions.
- Chromium production smoke suite: 5 paths passed with one worker.
- Final branch verification passed `bun run lint`, `bun run typecheck`, `bun run test`
  (205 files, 1,774 tests), `bun run build`, and `bun run release:scenario`.

The 11 August close-out pass also completed real-script lines mode, real-diagram image occlusion,
the two-install classroom merge, and Electron MCP connection/grant/consent checks. Camera, PWA and
folder-picker checks remain permission/platform-dependent release-matrix work rather than Arc 14
implementation debt. Detailed evidence is in `docs/WEBSITE_TEST_CHECKLIST.md`.
