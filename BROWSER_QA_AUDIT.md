# Browser QA audit — 16 July 2026

## Scope and environment

- Working tree: current local tree, including all pre-existing uncommitted changes.
- Browser: Codex in-app Browser only.
- Application: Vite development build at `http://127.0.0.1:5175/`.
- Desktop viewport: 1440×900.
- Mobile viewport: 390×844.
- Themes: dark landing/application state and light application state.
- Data states: first-run landing page, seeded example course, generated share code, a disposable course with one and two lessons, empty notes/cards, populated notes/cards, filtered results, no-review analytics, not-found course and lesson routes, and active/complete study sessions.

The disposable `Browser QA Empty` course was deleted after its empty and two-lesson states were exercised. A disposable `Browser QA Sequence` was created to reach the existing-sequence editor; it exists only in the in-app Browser's local QA profile.

## Route coverage

| Surface | Routes and states exercised | Controls exercised |
| --- | --- | --- |
| First run | `/welcome` | Smooth-scroll control, exam-date slider presence, demo-card entry, answer reveal, checkpoint skip and app-entry actions. |
| Dashboard and shell | `/`, `/deck/legacy` redirect | Course cards, new-course dialog and validation, theme selection, desktop sidebar, mobile navigation drawer and legacy redirect. |
| Guided study | `/study`, `/course/:courseId/study` | Course choice, lesson-notes introduction, collapsible note, Continue, Pomodoro open/start, mobile study chrome and Exit presence. |
| Learn sessions | `/learn`, `/course/:courseId/learn?mode=cram` | Global card state, keyboard Space reveal, answer phase, focus/full-screen/card-action controls and completed Cram report. |
| Course path | `/course/:courseId` | Read/Edit mode, Study now, lesson nodes, add-lesson inline form, middle practice-node insertion, lesson-scope buttons and mobile path layout. |
| Lesson | `/course/:courseId/lesson/:lessonId` | Read and edit modes, note expansion, empty note/card states, note editing/preview/cancel, link-existing empty dialog and card/sequence entry points. |
| Question bank | `/course/:courseId/bank` | Search, lesson groups, create card/sequence, existing-card hover actions, existing-card edit route, sequence group and existing-sequence edit route. |
| Card editor | `/course/:courseId/cards/new`, `/course/:courseId/lesson/:lessonId/cards/:cardId/edit` | Card type choices, Markdown fields and preview, validation, tags, reverse option, cancel, save actions and mobile sticky actions. |
| Sequence editor | `/course/:courseId/sequence/new`, `/course/:courseId/sequence/:sequenceId/edit` | All six presets, chunks/scenes, cue window, label-card option, item controls, script paste/split/confirm, speaker selection, generated-card preview, validation, cancel, save and danger-zone presence. |
| Course settings | `/course/:courseId/settings` | Course identity, objective, scheduling fields, retention presets, unlock mode, auto-practice, lesson-view mode, exam dates, lesson management, practice nodes, optimisation state, save/cancel and course deletion/Undo exposure. |
| Course analytics | `/course/:courseId/analytics` | Empty/no-review chart states and back navigation. |
| Search | `/search` | Text query, content results, card filters and clear-state presence. |
| Share | `/share` | Course selection, image warning, text share-code generation, QR/plain-text actions, import field disabled/enabled states and scanner entry. |
| Global analytics | `/analytics` | Single-course comparison guard and all no-review/no-leech chart states. |
| Global settings | `/settings` | Appearance, input mode, sidebar controls, dashboard sorting/detail, grading and typing controls, practice defaults, shortcut rows, Pomodoro, install unavailable state, all export formats, import entry, backup/persistence/folder controls and restore-point actions. |
| Help | `/help` | Full documentation content and footer navigation. |
| Errors | `/course/not-found`, `/course/:courseId/lesson/not-found` | Not-found messages and recovery links. |

Responsive checks covered the dashboard, navigation drawer, course path, settings, card editor, sequence editor and guided study. No horizontal overflow or clipped actionable control remained after transition animations settled.

## Verified defects and fixes

### BQA-001 — Share-code prefixes were described as payload versions

**Reproduction**

1. Open Share.
2. Select the seeded course.
3. Generate a text share code.
4. Observe that the current course export begins `LAC1`.
5. Read the import guidance, which claimed `LAC0/LAC1` were legacy deck codes and `LAC2/LAC3` were current course codes.

**Cause**

The prefixes identify base64/Base45 and compressed/plain encodings. Payload version is encoded inside the code; current course payloads can use `LAC1`.

**Fix**

The guidance now states that all `LAC0–LAC3` encodings support legacy deck and current course exports. `SharePage.test.tsx` asserts the corrected copy.

### BQA-002 — Help documented obsolete or unreachable behaviour

**Reproduction**

1. Open Help and read Courses & lessons and Study modes.
2. Compare Course settings with the actual course-settings screen: import/export is global, not course-scoped.
3. Compare Study today with the Help claim: the current screen asks the learner to choose one course.
4. Compare the claimed automatic Cram dropdown with the guided course flow: no such dropdown exists, and the roadmap labels the Cram rebuild as not yet shipped.

**Fix**

Help now describes configurable lesson unlocking, the actual contents of Course settings, the course picker used by Study today and lesson/session-scoped Simple learn. The false automatic Cram-dropdown card was removed.

### BQA-003 — Settings and practice switches lacked accessible names

**Reproduction**

1. Open Settings and inspect the Sidebar or Study & scheduling switches with the accessibility tree.
2. Open a course in Edit mode and insert a practice node.
3. The affected controls were exposed only as `switch`, with no name; the practice control did not announce `Randomise order`.

**Cause**

Visible descriptions sat beside the shared `Toggle` component but were not associated with its button.

**Fix**

`Toggle` now accepts a non-visual `ariaLabel`. Every affected global-settings switch, each primary-navigation visibility switch and the practice-node randomisation switch now has a specific accessible name. Component and Settings regression tests cover the contract. Browser re-verification confirmed names including `Show due card counts`, `Compact mode` and `Randomise order`.

## Verification record

The final verification commands and their results are recorded here after the final run:

- `bun run typecheck`: passed.
- `bun run lint`: passed.
- `bun run test`: passed, 117 test files and 991 tests.
- `bun run build`: passed. Vite reported only the existing mixed static/dynamic import and large-chunk warnings.
- PWA precache inspection: passed. `dist/sw.js` precaches five generated entries (`index.html`, `icon.svg`, the application stylesheet, the vendor bundle and the application bundle), uses `index.html` as the navigation fallback, and retains the script, font and WebAssembly runtime caches. Every referenced precache file exists in `dist`.

## Remaining blockers

None identified in browser coverage. Permission-dependent camera scanning, file-picker imports, folder mirroring, installation prompts and full-screen permission UI were verified up to their entry controls but were not granted, because doing so would cross browser/OS permission boundaries rather than test Lacuna's own UI.
