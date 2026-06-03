# Lacuna — Frozen Specification

The design decisions agreed during requirements gathering. British English; no emojis throughout.

## Stack
Vite + React 18 + TypeScript · Tailwind v4 (class dark mode) · Dexie (IndexedDB) · React Router (hash) ·
Motion · react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight + rehype-raw ·
Recharts. Fonts: Fraunces (display), Geist (body), JetBrains Mono (code/timer).

## Data model (Dexie, `src/db/`)
- **Deck**: `id, name, examDate, createdAt, examDatePromptDismissed?, fsrsVersion, fsrsParameters,
  examObjective`. `examDate` defaults to creation + 7 days at 23:59 local. `fsrsParameters` holds
  the 21 FSRS-6 weights + request retention; `examObjective` is `'expectedMarks'` (default) or
  `'securedTopics'`.
- **Card**: `id, deckId, type('front_back'|'cloze'), front, back, stability, difficulty, lastReviewed,
  reps, lapses, state, due, scheduledDays, learningSteps, history[], createdAt`. Cloze source lives
  in `front`; `back` empty for cloze. The reps/lapses/state/due fields mirror ts-fsrs's card.
- **SessionHistory**: `{timestamp, deckId, averagePredictedRetrievability}` — written **per answered
  card**; analytics aggregate to the last snapshot per calendar day.
- **UserPerformance** (**per deck**): Welford running mean/stddev + `m2` + `totalCorrectReviews`,
  updated on correct (Yes) reviews only.
- Import: **Replace all** or **Merge** (by id, newest `lastReviewed`/`createdAt` wins). Export: versioned
  JSON of the whole database.

## FSRS-6 (`src/fsrs/`)
All memory-state maths is delegated to the official `ts-fsrs` package (FSRS-6, 21 trainable
parameters w0..w20; w20 is the trainable decay). `src/fsrs/fsrs.ts` is a thin wrapper that maps
between Lacuna's stored card shape and ts-fsrs's. The parameter set and an explicit `fsrsVersion`
are persisted per deck. Forward simulation (`forwardSim.ts`) is our own pure layer on top:
`R(t,S)=(1+factor·t/S)^decay`, `factor=0.9^(1/decay)−1`, `decay=−w20` — so R=0.90 exactly at t=S,
and with w20=0.5 it reduces to FSRS-4.5's `factor=19/81`. Elapsed time in fractional days;
`d_exam_remaining` clamped at 0.

## Learn mode (`src/pages/LearnMode.tsx`)
- **Objective-driven queue** (`src/fsrs/objective.ts`), re-sorted on every serve. The scheduler's
  sort metric and the progress bar are both derived from `deck.examObjective`, so they can never
  disagree (the core invariant). Brand-new cards assume a Good initial stability `S=w[2]`.
- **Invisible timer**: starts on reveal, stops on "Show answer"; runs continuously and never pauses.
- **Grade mapping**: No → 1. Yes: calibration (<20 correct in deck) uses 3s/8s; otherwise μ ± 0.75σ.
- **Cooldown** = 5 on a fail (scaled to `deckSize-1` under 6 cards), in-memory; skip-and-decrement.
- **Progress bar** follows the objective: under `expectedMarks` it is the **mean predicted exam-day
  R** across the deck; under `securedTopics` it is the **% of cards with predicted exam-day R ≥ 0.90**.
  Session **auto-ends** when the objective is met (all cards secured, or no card offers a further
  meaningful gain in Σ R), or on manual exit; both show the **report** (cards, accuracy, mean time,
  grade distribution, focus %).
- **Distraction** (Page Visibility + blur) is recorded for the report only — no effect on grade.
- Keyboard: Space = show answer; Y/J = Yes; N/F = No.
- **Exam-date prompt** appears on first Study (date + time, "don't ask again"); also editable in deck
  settings.

## Cards & editor
- Cloze hides all `cN` spans at once; `::hint` supported; back reveals answers highlighted inline.
- Editor (in Deck view) has a formatting toolbar (bold, italic, heading, lists, code, link, image,
  cloze auto-index, inline/block maths) and a live split preview (tabbed on mobile).
- Images downscaled to ≤1280px, re-encoded ~0.8, stored as base64 and embedded via Markdown.

## Navigation & decks
Dashboard / Deck view (Cards+editor | Analytics, plus Study and settings) / Settings. Multi-select with
bulk delete, cross-deck **merge** (keeps target's name/examDate/performance, concatenates SessionHistory),
and card move. Top-level + per-route error boundaries. Theme persisted in `localStorage`; demo deck seeded
on first run.
