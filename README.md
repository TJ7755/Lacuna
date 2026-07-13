# Lacuna

[![CI](https://github.com/TJ7755/lacuna/actions/workflows/ci.yml/badge.svg)](https://github.com/TJ7755/lacuna/actions/workflows/ci.yml)

A local-only, serverless revision application built around the **FSRS-6** spaced-repetition
algorithm (via the official `ts-fsrs` library). Material is organised into **courses**, each
made of **lessons** studied in order along a path; every card is scheduled to peak on the
course's exam day, you grade yourself with a single **Yes / No**, and an invisible response
timer infers the real FSRS grade behind the scenes.

All data lives in your browser via **IndexedDB** — nothing is sent anywhere. Use **Settings → Import &
export** to back up or move your data as a single JSON file.

## Highlights

- **Courses, lessons and notes** — a course is the top-level subject; it holds an ordered
  path of lessons, each with its own Markdown notes and cards. Completing a lesson unlocks
  the next; checkpoints mark exam dates and practice nodes gather up due cards from lessons
  studied so far, whether auto-inserted or placed manually by a teacher. A single-lesson
  course skips the path and opens straight into that lesson. Each lesson's `/learn` session
  defaults to new material, but a teacher can switch it to revision (due cards) or both.
- **FSRS-6 engine** via the official `ts-fsrs` library (21 trainable parameters, including the
  decay w20). All memory-state updates are delegated to the package; no hand-rolled FSRS maths.
- **Single exam objective** drives both the scheduler and the progress bar, so they can never
  disagree. Choose per course: **Expected marks** (default) maximises mean predicted exam-day
  retrievability and serves the card with the greatest Delta-R; **Secure topics** maximises how many
  cards clear 90% on exam day and serves the cheapest card to secure next.
- **Invisible rating engine** — Yes/No plus a hidden response timer, calibrated per course.
- **Simple learn mode** — an algorithm-free YES/NO study loop with no FSRS scheduling, no DB writes,
  and a live pill UI (Wrong / Remaining / Right). Cards loop until every one is marked correct.
- **Card types** — Basic (front/back), Reversed (back/front), Cloze, and Typing-answer (type the
  answer before revealing, with a comparison on the back).
- **Sequences** — author an ordered list once (e.g. the periodic table, a timeline, a chain of
  steps) and Lacuna generates a full set of overlapping-cloze cards, each cueing recall from the
  preceding items; editing the sequence regenerates its cards without losing their scheduling
  progress.
- **Cooldown slotting** — failed cards are held back briefly to prevent fatigue.
- **Continuous Learn mode** with a live, objective-aware progress bar that ends automatically once
  the objective is met, followed by a performance report (including a focus/distraction summary).
- **Markdown notes and cards** with GitHub-flavoured syntax, code highlighting, **KaTeX maths**,
  **cloze deletions** (`{{c1::answer::hint}}`), collapsible sections and embedded video (notes
  only), and **drag-and-drop images** (downscaled and stored inline).
- **Course-scoped analytics** — predicted exam-day trajectory, stability profile, review volume,
  and a per-lesson breakdown of cards, mastery and completion.
- **Course-wide search and command palette** — search across courses, lessons, notes and cards
  from one place, with structured filters (due, new, leech, flagged, suspended).
- **Question bank** — every card in a course in one place, regardless of which lesson it belongs
  to, for browsing, searching and bulk management.
- **Touch-first** with 44px targets, swipe gestures, bottom sheets, and auto-adjusting font size.
- Default **dark mode** with a light toggle, a collapsible sidebar, and fully responsive layout.
- British English throughout; no emojis.

## Getting started

```
git clone https://github.com/TJ7755/Lacuna.git
cd Lacuna
```

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run preview  # preview the production build
```

Open the printed local URL. A small example course is seeded on first run (it can be deleted).

### Electron (desktop build)

Lacuna can be packaged as a standalone Windows desktop application via Electron.

```bash
npm run electron:dev         # run Vite + Electron in parallel (dev mode)
npm run electron:build:win  # build the Windows NSIS installer
```

The Electron layer lives in `electron/` and adds a custom titlebar, local font
bundling, Cross-Origin Isolation headers for WASM, and auto-updates via
`electron-updater`. The web version is completely unaffected.

## How it works

| Area | Where |
| --- | --- |
| FSRS-6 engine wrapper (ts-fsrs) | `src/fsrs/fsrs.ts`, `src/fsrs/params.ts` |
| Forward simulation (exam-day R) | `src/fsrs/forwardSim.ts` |
| Exam objective (scheduler + bar) | `src/fsrs/objective.ts` |
| Yes/No → grade + Welford stats | `src/fsrs/grading.ts` |
| Cooldown slotting | `src/fsrs/cooldown.ts` |
| Exam-day mastery / progress | `src/fsrs/progress.ts` |
| IndexedDB schema & operations | `src/db/` |
| Course/lesson data layer | `src/state/useCourseData.ts`, `src/course/path.ts` |
| Course path, lesson view, question bank | `src/pages/CoursePath.tsx`, `src/pages/LessonView.tsx`, `src/pages/QuestionBank.tsx` |
| Sequence generation & editor | `src/db/sequenceGeneration.ts`, `src/pages/SequenceEditor.tsx` |
| Learn session | `src/pages/LearnMode.tsx` |
| Analytics charts | `src/components/analytics/` |

See `SPEC.md` for the full set of design decisions.

## Tech

React 18, TypeScript, Vite, Tailwind CSS v4, Dexie (IndexedDB), Motion, Recharts, react-markdown with
remark-gfm / remark-math / rehype-katex / rehype-highlight.

### Testing

Vitest with `fake-indexeddb` for database and FSRS layer tests, `@testing-library/react` and
`happy-dom` for UI component and hook tests. The test suite covers the FSRS engine, forward
simulation, import/export, asset handling, and UI components. Run `npm test` to execute.
