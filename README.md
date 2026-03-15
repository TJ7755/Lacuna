# Lacuna

Lacuna is a local-first spaced repetition application for serious study. It uses FSRS (Free Spaced Repetition Scheduler), not the older SM-2 algorithm, to schedule reviews based on modern recall research. Your data lives on your device in a real SQLite database. The code is MIT-licensed and self-hostable. A managed hosted tier is planned for sync and cloud backup.

## Features

- Three card types: Basic (question/answer), Cloze deletion (Anki-compatible syntax), and Image occlusion (for diagrams and maps)
- FSRS-based scheduling with four-rating review system (Again, Hard, Good, Easy)
- Exam Mode: prioritises cards by predicted retention before a deadline
- Nested deck organisation with tag support
- Block-based note editor (TipTap) with document import/export (PDF, DOCX)
- LLM integration for card generation, alternative phrasings, practice tests, and on-demand explanations
- Local-first: SQLite via sqlite-wasm (OPFS on web) or native Tauri plugin (desktop)
- Cross-platform: web app and desktop (Tauri)
- Dark and light mode via system preference

## Stack

| Concern    | Technology           |
| ---------- | -------------------- |
| Framework  | React + TypeScript   |
| Build tool | Vite                 |
| Desktop    | Tauri                |
| Database   | SQLite (sqlite-wasm) |
| ORM        | Drizzle              |
| Scheduler  | FSRS (ts-fsrs)       |
| Editor     | TipTap               |
| Animations | framer-motion        |

## Getting Started

### Prerequisites

- Node.js 20 or later
- Rust toolchain (desktop build only) — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- Platform-specific Tauri dependencies (desktop build only)

### Web app (development)

```bash
npm install
npm run dev
```

The app will run at `http://localhost:5173`.

### Desktop app (development)

Requires Rust toolchain and platform-specific Tauri dependencies.

```bash
npm install
npm run tauri:dev
```

### Production build

Web:

```bash
npm run build
```

Desktop installer:

```bash
npm run tauri:build
```

## LLM Configuration

Lacuna supports three LLM provider options:

- **Gemini** (default hosted tier, not yet available in v1)
- Any **OpenAI-compatible API** (bring your own key)
- **Ollama** (local inference, no API cost)

All configuration is managed via the Settings page in the app. No environment variables are required for v1.

## Design

See `DESIGN.md` for the full design record, including architecture decisions, deferred features, and repository conventions.

## Licence

MIT
