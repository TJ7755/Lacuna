# Lacuna

[![CI](https://github.com/TJ7755/lacuna/actions/workflows/ci.yml/badge.svg)](https://github.com/TJ7755/lacuna/actions/workflows/ci.yml)

A local-only, serverless revision application built around the **FSRS-6** spaced-repetition
algorithm (via the official `ts-fsrs` library). Material is organised into **courses**, each
made of **lessons** studied in order along a path; every Card is scheduled to peak on the
course's exam day. Classic recall Cards use a single **Yes / No** and an invisible response
timer to infer the FSRS grade. A separate, post-instruction **Questions** experiment provides
automatically marked numeric and working problems without mixing their schedules or evidence into
Card recall.

All data lives locally in **IndexedDB**. The web app sends none of it to an application server
unless you explicitly pair it with an optional sync relay; that relay receives encrypted snapshots
and cannot read your courses or review history. In the Electron build, an MCP client can access only
the data you authorise for that local process; write and destructive access require explicit
permission. Use **Settings → Full backup & recovery** to back up or move your data as a single
JSON file.

## Highlights

- **Courses, lessons and notes** — a course is the top-level subject; it holds an ordered
  path of lessons, each with its own Markdown notes and cards. Completing a lesson unlocks
  the next; interactive checkpoints show explicitly placed and scoped assessments, while
  practice nodes gather up due cards from lessons
  studied so far, whether auto-inserted or placed manually by a teacher. A single-lesson
  course skips the path and opens straight into that lesson. Each lesson's `/learn` session
  defaults to new material, but a teacher can switch it to revision (due cards) or both.
- **FSRS-6 engine** via the official `ts-fsrs` library (21 trainable parameters, including the
  decay w20). All memory-state updates are delegated to the package; no hand-rolled FSRS maths.
- **Single exam objective** drives both the scheduler and the progress bar, so they can never
  disagree. Choose per course: **Expected marks** (default) maximises mean predicted exam-day
  retrievability and serves the card with the greatest Delta-R; **Secure topics** maximises how many
  cards clear 90% on exam day and serves the cheapest card to secure next.
- **Invisible rating engine** — Yes/No plus a hidden response timer, calibrated from the
  current course/deck performance profile.
- **Simple learn mode** — an algorithm-free YES/NO study loop with no FSRS scheduling, no DB writes,
  and shared in-session card progress. Cards loop until every one is marked correct.
- **Recall Cards** — Basic (front/back), Reversed and Cloze Cards support an optional
  type-before-reveal presentation mode. Sequences and image occlusions also remain direct-recall
  Cards, each with its own Card schedule.
- **Post-instruction Questions** — a separate course tab holds fixed problems and built-in
  generated families. Every Question has exactly one primary Concept, optional prerequisites, a
  mandatory worked explanation and scheduling evidence isolated from Cards. Full marks schedule as
  FSRS Good; any incomplete answer schedules as Again; checker uncertainty withholds scheduling.
- **Audio cards** — attach or record an MP3, M4A/MP4, Ogg, WAV or WebM clip through the card
  editor. Audio uses the same local, content-addressed asset store as images; playback speed and
  autoplay are device settings, and Anki `[sound:…]` media imports intact.
- **Structured Question authoring** — build numeric answers and line-oriented working schemes in
  the Question editor, test them against pinned sample answers, or generate a clipboard prompt and
  stage a delimited batch for per-Question validation, editing and acceptance. Lacuna never sends
  lesson notes to a model itself.
- **Sequences** — author an ordered list once (e.g. the periodic table, a timeline, a chain of
  steps) and Lacuna generates a full set of overlapping-cloze cards, each cueing recall from the
  preceding items; editing the sequence regenerates its cards without losing their scheduling
  progress.
- **Image occlusion** — upload a labelled diagram, draw boxes over it once, and Lacuna generates
  one card per box: label boxes hide text printed on the diagram, feature boxes point at an
  unlabelled part and are answered by their paired label. Moving or re-pairing a box regenerates
  that card without losing its scheduling progress.
- **Cooldown slotting** — failed cards are held back briefly to prevent fatigue.
- **Assessment revision plans** — checkpoints and final assessments have explicit prefix or custom
  lesson coverage and card exclusions. A named assessment can create one persistent multi-day plan
  with editable daily budgets, model-ranked cards, honest window summaries and explicit ordinary
  Practice fallback when the short-term model cannot run.
- **Continuous Learn mode** with per-card progress for Simple Learn, scheduler-derived objective
  progress for FSRS and filtered sessions, optional start-in-Focus-Mode behaviour, and an
  automatic performance report (including a focus/distraction summary).
- **Markdown notes and cards** with GitHub-flavoured syntax, code highlighting, **KaTeX maths**,
  **cloze deletions** (`{{c1::answer::hint}}`), collapsible sections and embedded video (notes
  only), and **drag-and-drop images** (downscaled and stored inline).
- **Course-scoped analytics** — Card trajectory, stability, review volume and lesson breakdown stay
  separate from Question first/repeat, generated novel/repeat, marks and criterion evidence.
- **Course-wide search and command palette** — search across Courses, lessons, notes, Cards and
  Questions from one place. Card-only management filters remain due, new, leech, flagged and
  suspended.
- **Distinct Cards and Questions tabs** — Cards provides course-wide browsing, search and bulk
  management for recall material; Questions provides independent authoring and practice for
  application problems. Questions are deliberately not integrated into the Path in v1.
- **Touch-first** with 44px targets, swipe gestures, bottom sheets, and auto-adjusting font size.
- Default **dark mode** with a light toggle, a collapsible sidebar, and fully responsive layout.
- British English throughout; no emojis.

## Getting started

Lacuna uses [Bun](https://bun.sh/) for its JavaScript runtime, package manager, and
project scripts. The checked-in `bun.lock` is authoritative; use Bun 1.3.14 or newer.

```
git clone https://github.com/TJ7755/Lacuna.git
cd Lacuna
```

```bash
bun install
bun run dev      # start the dev server
bun run build    # type-check + production build
bun run preview  # preview the production build
```

Open the printed local URL. A small example course is seeded on first run (it can be deleted).

### Electron (desktop build)

Lacuna can be packaged as a standalone Windows desktop application via Electron.

```bash
bun run electron:dev         # run Vite + Electron in parallel (dev mode)
bun run electron:build:win  # build the Windows NSIS installer
```

The Electron layer lives in `electron/` and adds a custom titlebar, local font
bundling, Cross-Origin Isolation headers for WASM, and auto-updates via
`electron-updater`. It also hosts an authenticated local **Model Context Protocol (MCP)**
companion, allowing an MCP-capable client to work with Lacuna's courses, lessons, notes, Cards,
Concepts, Questions, sequences, image occlusions and summaries. Card and Question tools remain
separate; structured numeric and working payloads belong to Questions. The web version does not host
MCP and is otherwise unaffected.

Open Lacuna normally, then copy the JSON configuration from **Settings → MCP server** into
your client's local stdio-server configuration. Its command is the installed Lacuna executable
with `--mcp-companion` as its sole argument. For example, with Claude Code on macOS:

```bash
claude mcp add lacuna -- /Applications/Lacuna.app/Contents/MacOS/Lacuna --mcp-companion
```

Use the equivalent installed executable path on Windows. The companion attaches to the already
running application through a token-authenticated Unix-domain socket or Windows named pipe; it
does not open a network port or start another data-owning application. Lacuna must keep its renderer
window open because IndexedDB is owned by that process. Each connected client has separate,
ephemeral grants. Read access is granted implicitly per course with an in-app notice; the first
write or destructive call blocks for approval. Current connections and grants can be inspected,
changed or revoked under **Settings → MCP server**, and each client's grants expire on disconnect.

Run the isolated canonical release scenario with:

```bash
bun run release:scenario -- --scenario canonical
```

It builds disposable state through the real MCP tool handlers, verifies share and backup previews,
replacement import and reload persistence, then writes a machine-readable evidence report under
`artifacts/release-scenarios/`. Browser automation against the public Vercel deployment is a
separate zero-install GUI path and sees only that browser profile's origin-scoped IndexedDB.

The shipped MCP surface and its deliberate exclusions are specified in `docs/SPEC.md`. The delivered
§§2.12–2.13 foundation and proposed broader user-action surface are documented in
`docs/archive/roadmap-2026-08-11.md` §§2.12–2.14.

## How it works

| Area                                     | Where                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| FSRS-6 engine wrapper (ts-fsrs)          | `src/fsrs/fsrs.ts`, `src/fsrs/params.ts`                                             |
| Forward simulation (exam-day R)          | `src/fsrs/forwardSim.ts`                                                             |
| Exam objective (scheduler + bar)         | `src/fsrs/objective.ts`                                                              |
| Yes/No → grade + Welford stats           | `src/fsrs/grading.ts`                                                                |
| Cooldown slotting                        | `src/fsrs/cooldown.ts`                                                               |
| Exam-day mastery / progress              | `src/fsrs/progress.ts`                                                               |
| IndexedDB schema & operations            | `src/db/`                                                                            |
| Course/lesson data layer                 | `src/state/useCourseData.ts`, `src/course/path.ts`                                   |
| Course path, Cards and Questions         | `src/pages/CoursePath.tsx`, `src/pages/CardsPage.tsx`, `src/pages/QuestionsPage.tsx` |
| Sequence generation & editor             | `src/db/sequenceGeneration.ts`, `src/pages/SequenceEditor.tsx`                       |
| Occlusion generation & editor            | `src/db/occlusionGeneration.ts`, `src/pages/OcclusionEditor.tsx`                     |
| Question domain, checking and scheduling | `src/questions/`, `src/items/verify.ts`, `src/items/markSchemeCompiler.ts`           |
| MCP tool surface and Electron bridge     | `src/mcp/`, `electron/mcp/`                                                          |
| Learn session                            | `src/pages/LearnMode.tsx`                                                            |
| Analytics charts                         | `src/components/analytics/`                                                          |

See `docs/SPEC.md` for the full set of design decisions. The non-normative scientific assessment
is in `docs/scientific-assessment.md`; it records evidence strength, modelling assumptions,
and the limits of the current claims. Use `docs/WEBSITE_TEST_CHECKLIST.md` for the complete
browser release-verification pass.

## Tech

React 18, TypeScript, Vite, Tailwind CSS v4, Dexie (IndexedDB), Motion, Recharts, mathjs,
react-markdown with remark-gfm / remark-math / rehype-katex / rehype-highlight.

### Testing

Vitest with `fake-indexeddb` for database and FSRS layer tests, `@testing-library/react` and
`happy-dom` for UI component and hook tests. The test suite covers the FSRS engine, forward
simulation, import/export, asset handling, and UI components. Run `bun run test` for the full
one-worker suite, `bun run test:coverage` for the critical-domain coverage gate, and
`bun run test:e2e:web` for the one-worker Chromium production smoke suite.
