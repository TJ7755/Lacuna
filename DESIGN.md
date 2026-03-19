# DESIGN.md — Lacuna

> This document is the authoritative record of Lacuna's design decisions. It exists so that contributors — including future maintainers and the original author — do not have to reverse-engineer intent from code. If you are about to make a decision that contradicts something written here, update this document first and explain why.

---

## 1. Identity

**Name:** Lacuna
**Licence:** MIT
**Repository:** Open source. The software is free, permanently, for everyone.

### Business Model

Lacuna follows an open-core service model. The codebase is MIT-licenced and self-hostable by anyone. A managed hosted service is provided on top, which includes:

- Managed sync and cloud backup
- Hosted LLM access (no API key required)

The hosted service is the monetisation layer. The software is not. Nobody — including the original authors — may paywall features that exist in the open-source codebase.

---

## 2. Platform & Stack

### Frontend

| Concern         | Choice                        | Rationale                                                    |
| --------------- | ----------------------------- | ------------------------------------------------------------ |
| Framework       | React + TypeScript            | Mature ecosystem, strong typing, existing author familiarity |
| Build tool      | Vite                          | Fast, minimal config                                         |
| Desktop wrapper | Tauri                         | Rust-based, produces small binaries; explicitly not Electron |
| Mobile wrapper  | Capacitor                     | Shares the React codebase with web and desktop               |
| Styling         | TBD (CSS Modules or Tailwind) | To be resolved before first component is written             |

One codebase targets three platforms: web, desktop, and mobile.

### Local Storage

- **SQLite** via Drizzle ORM
- On web: `sqlite-wasm` (SQLite compiled to WebAssembly, runs in-browser)
- On desktop: Tauri's native SQLite plugin
- On mobile: Capacitor SQLite plugin
- The local database is always the primary read/write source. The server is a sync target, not an authority.

### Schema Conventions

Every record in the database must have:

```
id          UUID        Primary key — never an auto-increment integer
created_at  TIMESTAMP   Set on insert, never modified
updated_at  TIMESTAMP   Updated on every write
deleted_at  TIMESTAMP   Nullable. Soft deletes only — hard deletes are not used.
```

These fields are non-negotiable. They exist because sync, conflict resolution, and audit trails all depend on them. Retrofitting them later is painful.

### Backend (v2)

Sync is explicitly deferred to v2. When implemented:

- **Auth:** Auth0 (OAuth, JWT, session management). Internal `user_id` is stored as the primary key; Auth0's `sub` claim is a foreign key, not an identity.
- **API:** Node or Bun, containerised, deployed to Azure Container Apps (scales to zero)
- **Database:** Azure PostgreSQL Flexible Server
- **File storage:** Azure Blob Storage (card images, document attachments)
- **Avoid:** Azure Cosmos DB — expensive and offers no meaningful advantage over PostgreSQL at this scale.

---

## 3. Data Model Overview

### Decks

Decks are nested using a path-style hierarchy:

```
Subject::Topic::Subtopic
```

This mirrors Anki's convention and is familiar to the target audience. Tags are available as a supplementary organisational layer — they do not replace nesting.

### Cards

Three supported card types:

| Type            | Description                                                                         |
| --------------- | ----------------------------------------------------------------------------------- |
| Basic           | Front and back. Standard question/answer.                                           |
| Cloze           | Text with deletions marked `{{c1::answer}}`. Anki-compatible syntax.                |
| Image occlusion | An image with labelled regions hidden. Essential for diagrams, maps, and Geography. |

Image occlusion is a v1 feature, not a v2 deferral. It is considered essential.

### Notes

Notes are first-class features, not attachments. They are structurally linked to decks and cards — a note is a source document from which cards can be generated, and cards can link back to the note they came from.

Notes use a block/WYSIWYG editor (TipTap or BlockNote — to be resolved before implementation).

**Document support:**

| Direction | Scope                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| Import    | Upload a PDF or Office document (.docx, .pptx, .xlsx); content is converted and flows into an editable Lacuna note |
| Embed     | Display a PDF or Office document inline within a note as a readable attachment                                     |
| Export    | Save a Lacuna note as a PDF or .docx                                                                               |

---

## 4. Spaced Repetition

### Algorithm

**FSRS** (Free Spaced Repetition Scheduler), implemented via `ts-fsrs`.

SM-2 is not used. It is strictly inferior to FSRS on recall benchmarks and there is no credible argument for it in 2026.

### Review Ratings

Four ratings, matching FSRS's model:

| Key | Rating | Meaning                              |
| --- | ------ | ------------------------------------ |
| `1` | Again  | Complete failure to recall           |
| `2` | Hard   | Recalled with significant difficulty |
| `3` | Good   | Recalled correctly with some effort  |
| `4` | Easy   | Recalled instantly and effortlessly  |

### Input

Review supports all three input methods simultaneously:

- **Keyboard:** Spacebar to flip; `1`–`4` to rate
- **Mouse:** Click to flip; click rating button
- **Touch:** Tap to flip; tap rating button

Keyboard-first is the design priority; mouse and touch are equally supported.

---

## 5. Exam Mode

Exam Mode is a distinct scheduling layer that activates when a deck has an exam date attached. It does not replace FSRS — it sits on top of it.

### How It Works

FSRS exposes a **retrievability** value: the predicted probability of recall for a given card at any future date, based on the card's current memory stability. Exam Mode uses this to reframe scheduling:

- Standard mode asks: _when should I next review this card?_
- Exam Mode asks: _which cards most need review before this deadline?_

On each study session, Exam Mode:

1. Computes predicted retention for every card in the deck at the exam date
2. Ranks cards by ascending predicted retention — the weakest cards first
3. Schedules the session accordingly, updating daily as reviews change the estimates

This is a greedy approximation of maximising minimum retention across all cards by the exam date.

### Honesty Constraint

If the number of cards significantly exceeds what can realistically be reviewed before the exam at the user's current pace, Lacuna surfaces a plain-language estimate:

> "At your current review pace, you can meaningfully cover approximately 80 cards before your exam on [date]."

Lacuna does not silently pretend an impossible workload is manageable.

---

## 6. LLM Integration

### Provider Interface

The LLM layer is **provider-agnostic**. A single interface abstracts over providers; no model name or API endpoint is hardcoded into business logic. This is non-negotiable — model generations turn over quickly and coupling the codebase to a specific model is technical debt from day one.

### Providers

| Tier             | Provider                  | Model                 | Notes                                                         |
| ---------------- | ------------------------- | --------------------- | ------------------------------------------------------------- |
| Hosted (default) | Google                    | Gemini 3.1 Flash-Lite | Cheapest capable option at time of writing; subject to change |
| BYOK             | Any OpenAI-compatible API | User-specified        | For developers and power users                                |
| Self-hosted      | Ollama                    | User-specified        | Local inference, no API cost                                  |

### Capabilities

LLM integration is Copilot-style — available across the app, not siloed to one feature. Specific capabilities:

- **Card generation** — generate flashcards from a pasted passage, uploaded document, or an existing note
- **Alternative phrasings** — rewrite an existing card's question or answer from a different angle
- **Practice tests** — generate a short written or multiple-choice test from a deck or note
- **On-demand explanation** — during review, request an explanation of why an answer is correct, with context from the linked note if available
- **Note summarisation** — condense a long note into key points suitable for card generation

### Monetisation Note

BYOK and self-hosted (Ollama) options are available in the open-source build at no cost. The hosted managed tier — where Lacuna proxies requests through its own API key — is a paid feature of the hosted service. This is the open-core boundary.

---

## 7. Design Language

### The Non-Negotiables

**No emojis.** This applies to every part of the UI shell: buttons, labels, navigation, empty states, error messages, loading states, tooltips — everything. This is enforced, not requested:

- ESLint rule scanning for Unicode emoji codepoints in `.tsx`, `.ts`, and `.css` files
- Pre-commit hook via Husky that fails if emoji codepoints are detected in UI source files
- User-generated card content is exempt — users may write what they like on their own cards

If you are about to add an emoji to an empty state, do not.

**British English.** Every user-facing string uses British spelling and conventions. This is not cosmetic:

- Spelling: colour, behaviour, organise, licence (n.), license (v.), centre, programme
- All user-facing strings are externalised in `ui-strings.ts` — none are hardcoded inline in JSX
- Date formatting: `DD/MM/YYYY` via `Intl.DateTimeFormat('en-GB')` — never `toLocaleDateString()` without an explicit locale
- Number formatting: `Intl.NumberFormat('en-GB')` — thousands separator is a comma
- Preferred vocabulary: "Revision" over "Studying" where applicable; "Maths" not "Math"

### Colour & Theme

- System-aware dark and light mode via `prefers-color-scheme`
- Neutral palette — no gamified neon, no high-saturation accent colours
- The review interface should feel closer to a blank page than a game UI

### Typography

| Context      | Typeface                                                      |
| ------------ | ------------------------------------------------------------- |
| Card content | Lora or Source Serif 4 — readable serif for study-length text |
| Code blocks  | JetBrains Mono or Fira Code                                   |
| UI chrome    | Inter                                                         |

### Layout & Density

- Medium density — not aggressively sparse, not cramped
- During review, the card occupies the full viewport. All other UI is secondary.
- Information is presented numerically where possible. Progress is a number, not a metaphor.

### Animations

Animations are permitted where they communicate state or aid comprehension. They are not permitted as rewards.

**Permitted:**

- Card flip (subtle 3D reveal between front and back)
- Card slide transitions between review states
- Micro-interactions: button press states, hover responses, focus rings
- Linear progress bar fill during a review session

**Not permitted:**

- Confetti or particle effects on correct answers
- Streak animations or fire graphics
- Bouncing or pulsing progress elements
- Any animation whose purpose is congratulation rather than communication

Implementation via `framer-motion`.

---

## 8. Deferred to v2

The following are intentional deferrals. They are not forgotten; they are out of scope for v1.

| Feature                    | Notes                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Sync backend               | Auth0 + Azure stack is designed with sync in mind; implementation deferred                                                     |
| Shared / community decks   | Personal tool first; social layer second                                                                                       |
| Sequence Learner card type | Ordered recall (periodic table, reactivity series, chronologies) — requires its own card type and scheduler distinct from FSRS |
| Mobile build (Capacitor)   | Desktop shipped in v1. Mobile deferred.                                                                                        |

---

## 9. Repository Conventions

- `DESIGN.md` — this file — lives in the repo root
- `ui-strings.ts` — all user-facing copy; no inline JSX strings
- `.env.example` — placeholder values for all required environment variables
- `.env` — in `.gitignore`; never committed
- Secrets (Auth0 credentials, API keys, Azure connection strings) are never committed to the repository under any circumstances

---

## 10. What Lacuna Is Not

It is worth being explicit about what is out of scope, permanently, not just deferred:

- A gamified learning platform. Lacuna is a study tool.
- A social network. Shared decks are a convenience feature, not a community product.
- An AI tutor. The LLM is a utility, not a personality.
- An Electron app. Tauri exists.
- An app with emojis in the UI.

---

## 11. V2 — Exam Mode (Revised)

V1 Exam Mode ranks cards by ascending predicted retrievability at the exam date and reviews them in that order. This is a greedy approximation — correct in intent, but it does not distribute effort intelligently across the days remaining before the exam.

V2 replaces this with a full optimisation model. The design principles are:

- **Action-first.** The user is told how much to study today, not how many cards are due. "Study approximately 20 minutes" is a better primitive than "47 cards remaining."
- **Goal-driven.** The objective is a target retention level at the exam date (default: 90%), not a schedule.
- **Flexible.** The model adapts to inconsistent study behaviour. Skipping a day or over-studying updates the plan without requiring manual reconfiguration.
- **Conservative.** When uncertain, the model slightly overestimates required effort. It is better for a student to feel slightly over-prepared than to arrive at an exam having been told everything was fine.

### The Optimisation Model

Every card has FSRS-derived memory parameters: stability, difficulty, and a current retrievability value. These are already stored in `fsrs_state` and are not changed by V2 — Exam Mode reads from FSRS state, it does not write a competing schedule.

The model computes:

1. **Predicted retrievability at exam date** for each card, using `getRetrievability(state, examDate)`. This is already implemented in `src/lib/fsrs.ts`.

2. **Deck-level exam readiness**: the percentage of cards with predicted retrievability at or above a threshold (default: 70%). This is reported as a single number — "68% exam ready" — not as a mean, not as a weighted score. The threshold is configurable per deck. A card that the student will probably recall is counted; one they probably will not is not. Simple, honest, and resistant to gaming.

3. **Minimum review effort to reach target retention**: for each card below the target, FSRS can predict how much reviewing it today (or tomorrow, or in N days) would increase its retrievability at the exam date. The model selects a review schedule across remaining days that maximises the number of cards above the target threshold at exam date, subject to a daily time budget.

   The formal objective is: _maximise the count of cards with retrievability ≥ target at exam date, subject to a maximum daily review time T minutes._

   This is solved greedily per day: rank cards by the marginal improvement in exam-date retrievability per minute of review effort today. Review in that order until the daily budget is exhausted.

4. **Daily time recommendation**: the number of minutes needed today to stay on track. If the student studied more than recommended yesterday, today's recommendation decreases. If they skipped a day, it increases. The recommendation is recomputed fresh each day from current FSRS state — there is no stored plan to invalidate.

### Time Estimation

FSRS does not record how long a review takes. V2 estimates review time at a flat rate: **1.5 minutes per card** (average of easy and hard cards). This is a deliberate simplification. Per-card timing data could be collected and used in V2+, but it is not required for the model to be useful.

The estimate is presented honestly: "approximately 20 minutes" not "20 minutes". Users who review quickly will find the estimates conservative; users who review slowly will find them tight. Both outcomes are acceptable — the conservative design principle applies here.

### User-Facing Output

When Exam Mode is active on a deck, the deck detail page shows:

- **Exam readiness**: percentage of cards above the recall threshold at exam date (e.g. "68% exam ready")
- **Daily recommendation**: approximate study time for today (e.g. "~20 min today")
- **Days remaining**: integer count of days until exam
- **On-track indicator**: whether the current trajectory reaches the target by exam date

What is deliberately not shown:

- Individual card due dates (irrelevant in Exam Mode)
- Forgetting curves per card (useful for understanding, not for driving action — available on request, not surfaced by default)
- "Panic mode" warnings (addressed through the conservative time estimates, not through alarming UI)

### Relationship to FSRS Mode

FSRS Mode and Exam Mode share all card data. Reviewing a card in either mode updates `fsrs_state` identically. The difference is only in how the next card to review is selected:

- FSRS Mode: review cards where `fsrs_state.due ≤ now`, ordered by due date
- Exam Mode: review cards in order of marginal exam-date improvement, up to the daily time budget

Modes are toggled per deck. Toggling does not reset progress. A deck can switch between modes freely without data loss.

When a deck has no exam date set, it operates in FSRS Mode only — Exam Mode is not available without a target date.

---

## 12. V2 — Sequence Learner Card Type

The Sequence Learner card type supports ordered recall: the periodic table, the reactivity series, historical chronologies, taxonomic classifications, muscle origins and insertions in order. These cannot be adequately represented as independent basic or cloze cards because knowing each pair does not guarantee the ability to reproduce the sequence.

### Card Format

A sequence card stores an ordered list of items:

```
id          UUID
deck_id     FK
card_type   'sequence'
sequence    JSON array of strings — the canonical ordered list
title       string — prompt shown to the user (e.g. "Reactivity series, most to least reactive")
```

### Review Mechanics

The card is presented as a drag-and-drop ordering interface. The user is shown all items in randomised order and must arrange them correctly. The score is a **position error** metric: the sum of absolute differences between each item's correct position and its submitted position, normalised to a 0–1 range (0 = perfect, 1 = completely reversed).

```
score = 1 - (sum of |correct_position[i] - submitted_position[i]|) / max_possible_error
```

This score is mapped to an FSRS-compatible rating:

| Score  | FSRS Rating |
| ------ | ----------- |
| ≥ 0.95 | Easy        |
| ≥ 0.80 | Good        |
| ≥ 0.50 | Hard        |
| < 0.50 | Again       |

This mapping allows sequence cards to use the existing `fsrs_state` table and scheduling infrastructure without modification. The sequence card type is a new front-end and a new scoring model; the back-end is unchanged.

### Partial Credit and Anchors

A sequence card may designate certain items as **anchors** — items whose position is fixed and shown to the user during review (e.g. the first and last element of a series). Anchors reduce cognitive load for long sequences by providing reference points. Anchor positions are not scored.

Anchors are stored as a JSON array of indices in the card's `sequence` field alongside the items:

```json
{
  "items": ["Li", "Na", "K", "Rb", "Cs"],
  "anchors": [0, 4]
}
```

### Scheduler Note

Sequence cards use FSRS state identically to basic and cloze cards. The `rating_history` field records which FSRS rating was submitted on each review, derived from the position error score. No new scheduler is needed — the card type is novel, the scheduling is not.

---

## 13. V2 — Sync Backend

Sync is the hardest part of V2. The local SQLite database is the source of truth; the server is a sync target. This section specifies the conflict resolution model and the backend architecture.

### Conflict Resolution

Every record has `updated_at` and `deleted_at` timestamps. Conflict resolution uses **last-write-wins at the field level**: whichever device has the more recent `updated_at` for a given record wins.

Soft deletes are respected: a record deleted on one device (non-null `deleted_at`) is not resurrected by a concurrent update from another device. Deletion wins over update when both happen within the same sync window.

This model is not perfect — a concurrent edit to the same card's front on two devices will lose one version silently. It is however simple, auditable, and sufficient for a single-user tool. The `rating_history` JSON array on `fsrs_state` is the only field where merging is preferable to overwriting — see below.

### `rating_history` Merge

The `rating_history` field on `fsrs_state` is a JSON array of timestamped review records. When two devices both have reviews for the same card that the other device has not seen, last-write-wins would discard one device's reviews.

Instead, `rating_history` is merged: the union of all review records from both devices, deduplicated by timestamp and sorted chronologically. After merging, FSRS state (stability, difficulty, due) is recomputed from the full merged history using `ts-fsrs`'s replay function.

This is the only field in the schema that requires merge logic rather than last-write-wins.

### Backend Architecture

As specified in section 2:

| Component    | Choice                           | Notes                                |
| ------------ | -------------------------------- | ------------------------------------ |
| Auth         | Auth0                            | OAuth, JWT, session management       |
| API          | Node or Bun, containerised       | Azure Container Apps, scales to zero |
| Database     | Azure PostgreSQL Flexible Server | Same schema as local SQLite          |
| File storage | Azure Blob Storage               | Card images, document attachments    |

The internal `user_id` is a UUID primary key in the PostgreSQL `users` table. Auth0's `sub` claim is a foreign key, not the identity — this allows auth provider migration without touching the data model.

The sync API exposes a single endpoint per table: `POST /sync/:table`. The request body contains all records modified since the last sync timestamp. The server applies last-write-wins (or merge logic for `rating_history`) and returns all records modified by other devices since the same timestamp.

Sync is triggered:

- On app launch, if online
- On return from background (mobile, Capacitor)
- On explicit user action ("Sync now" button in Settings)
- Never automatically mid-session — syncing during a review session would mutate the session queue

### Identity and Multi-Device

A user's data is scoped to their `user_id`. Multiple devices are first-class — the schema and sync model are designed for it. Sharing data between different user accounts (community decks) is a separate feature and is not part of the sync model.

### Self-Hosting

The sync backend is MIT-licenced alongside the frontend. A self-hoster can run the API and PostgreSQL instance themselves. The `.env.example` documents the required environment variables. The hosted managed service is identical code — no forks, no separate codebase.

---

## 14. V2 — Mobile Build (Capacitor)

The Capacitor build shares the React frontend with the web and desktop builds. No new UI is required — the existing responsive layout targets mobile viewports.

The primary concern is SQLite. On mobile, `@sqlite.org/sqlite-wasm` with OPFS is not appropriate — mobile browsers have inconsistent OPFS support. Instead, the Capacitor build uses `@capacitor-community/sqlite`, which wraps the device's native SQLite implementation.

This requires a platform abstraction layer in `src/db/client.ts`: the database client detects the runtime environment (OPFS-capable browser, Tauri, Capacitor) and initialises the appropriate SQLite backend. The Drizzle ORM layer above it is unchanged — the abstraction is entirely in the client initialisation, not in any query code.

Capacitor targets iOS and Android. The web and desktop builds are unaffected.

---

## 11. Sequence Learner Card Type

Purpose: the Sequence Learner supports ordered recall where order is the skill, such as the periodic table, reactivity series, poetry stanzas, and dramatic lines.

### Data model decisions

- Sequence cards are stored in `sequence_cards` (title + deck linkage).
- Sequence entries are stored in `sequence_items` (one item per ordered position).
- Item positions are 1-indexed.
- `fsrs_state.card_id` is polymorphic by design:
  - item-level state rows use `sequence_items.id`
  - sequence-level Full Run state rows use `sequence_cards.id`
- This is Option A: a loose UUID reference with no enforced FK constraint on `fsrs_state.card_id`.

### Review modes

1. **Chain Drill** — prompts each item from the previous item (or sequence title for item 1), schedules per item using that item's FSRS row.
2. **Position Drill** — alternate prompts between ordinal cue ("What is item N?") and predecessor cue ("What comes after…?"), still updating the same per-item FSRS row.
3. **Full Run** — rehearses the entire sequence in order, then self-rating updates only the sequence-level FSRS row (`card_id = sequence_cards.id`).
4. **Lines Mode** — cue/reveal rehearsal mode with optional auto-advance; it never updates FSRS state and is not part of scheduling.

### Position immutability rule

- Sequence item ordering is editable until any sequence item has a non-null `last_review`.
- After the first recorded review on any item in the sequence, item positions are immutable.
- Title edits remain permitted after lock.
