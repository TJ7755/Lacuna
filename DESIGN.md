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

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React + TypeScript | Mature ecosystem, strong typing, existing author familiarity |
| Build tool | Vite | Fast, minimal config |
| Desktop wrapper | Tauri | Rust-based, produces small binaries; explicitly not Electron |
| Mobile wrapper | Capacitor | Shares the React codebase with web and desktop |
| Styling | TBD (CSS Modules or Tailwind) | To be resolved before first component is written |

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

| Type | Description |
|---|---|
| Basic | Front and back. Standard question/answer. |
| Cloze | Text with deletions marked `{{c1::answer}}`. Anki-compatible syntax. |
| Image occlusion | An image with labelled regions hidden. Essential for diagrams, maps, and Geography. |

Image occlusion is a v1 feature, not a v2 deferral. It is considered essential.

### Notes

Notes are first-class features, not attachments. They are structurally linked to decks and cards — a note is a source document from which cards can be generated, and cards can link back to the note they came from.

Notes use a block/WYSIWYG editor (TipTap or BlockNote — to be resolved before implementation).

**Document support:**

| Direction | Scope |
|---|---|
| Import | Upload a PDF or Office document (.docx, .pptx, .xlsx); content is converted and flows into an editable Lacuna note |
| Embed | Display a PDF or Office document inline within a note as a readable attachment |
| Export | Save a Lacuna note as a PDF or .docx |

---

## 4. Spaced Repetition

### Algorithm

**FSRS** (Free Spaced Repetition Scheduler), implemented via `ts-fsrs`.

SM-2 is not used. It is strictly inferior to FSRS on recall benchmarks and there is no credible argument for it in 2026.

### Review Ratings

Four ratings, matching FSRS's model:

| Key | Rating | Meaning |
|---|---|---|
| `1` | Again | Complete failure to recall |
| `2` | Hard | Recalled with significant difficulty |
| `3` | Good | Recalled correctly with some effort |
| `4` | Easy | Recalled instantly and effortlessly |

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

- Standard mode asks: *when should I next review this card?*
- Exam Mode asks: *which cards most need review before this deadline?*

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

| Tier | Provider | Model | Notes |
|---|---|---|---|
| Hosted (default) | Google | Gemini 3.1 Flash-Lite | Cheapest capable option at time of writing; subject to change |
| BYOK | Any OpenAI-compatible API | User-specified | For developers and power users |
| Self-hosted | Ollama | User-specified | Local inference, no API cost |

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

| Context | Typeface |
|---|---|
| Card content | Lora or Source Serif 4 — readable serif for study-length text |
| Code blocks | JetBrains Mono or Fira Code |
| UI chrome | Inter |

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

| Feature | Notes |
|---|---|
| Sync backend | Auth0 + Azure stack is designed with sync in mind; implementation deferred |
| Shared / community decks | Personal tool first; social layer second |
| Sequence Learner card type | Ordered recall (periodic table, reactivity series, chronologies) — requires its own card type and scheduler distinct from FSRS |
| Mobile build (Capacitor) | Web and desktop ship first |

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