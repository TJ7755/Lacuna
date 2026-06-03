# Lacuna — Frozen Specification

The design decisions agreed during requirements gathering. British English; no emojis throughout.

## Stack
Vite + React 18 + TypeScript · Tailwind v4 (class dark mode) · Dexie (IndexedDB) · React Router (hash) ·
Motion · react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight + rehype-raw ·
Recharts. Fonts: Fraunces (display), Geist (body), JetBrains Mono (code/timer).

## Data model (Dexie, `src/db/`)
- **Deck**: `id, name, examDate, createdAt, examDatePromptDismissed?`. `examDate` defaults to
  creation + 7 days at 23:59 local.
- **Card**: `id, deckId, type('front_back'|'cloze'), front, back, stability, difficulty, lastReviewed,
  history[], createdAt`. Cloze source lives in `front`; `back` empty for cloze.
- **SessionHistory**: `{timestamp, deckId, averagePredictedRetrievability}` — written **per answered
  card**; analytics aggregate to the last snapshot per calendar day.
- **UserPerformance** (**per deck**): Welford running mean/stddev + `m2` + `totalCorrectReviews`,
  updated on correct (Yes) reviews only.
- Import: **Replace all** or **Merge** (by id, newest `lastReviewed`/`createdAt` wins). Export: versioned
  JSON of the whole database.

## FSRS-4.5 (`src/fsrs/`)
17 default weights; `R(t,S)=(1+(19/81)(t/S))^-0.5`; first-review `S0=w[g-1]`,
`D0=clamp(w4-(g-1)w5,1,10)`; subsequent `D=clamp(D-w6(g-3),1,10)`; success/failure stability per spec;
`S>=0.1`. Elapsed time in fractional days; `d_exam_remaining` clamped at 0.

## Learn mode (`src/pages/LearnMode.tsx`)
- **Delta-R queue**, re-sorted on every serve. Brand-new cards assume `S=w[2]`.
- **Invisible timer**: starts on reveal, stops on "Show answer"; runs continuously and never pauses.
- **Grade mapping**: No → 1. Yes: calibration (<20 correct in deck) uses 3s/8s; otherwise μ ± 0.75σ.
- **Cooldown** = 5 on a fail (scaled to `deckSize-1` under 6 cards), in-memory; skip-and-decrement.
- **Progress bar** = % of cards with predicted exam-day `R ≥ 0.90`. Session **auto-ends at 100%**, or on
  manual exit; both show the **report** (cards, accuracy, mean time, grade distribution, focus %).
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
