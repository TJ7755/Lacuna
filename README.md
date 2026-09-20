# Lacuna

[![CI](https://github.com/TJ7755/Lacuna/actions/workflows/ci.yml/badge.svg)](https://github.com/TJ7755/Lacuna/actions/workflows/ci.yml)

Lacuna is a local-first revision app built around FSRS-6. Organise material into courses,
lessons and notes, then practise recall Cards towards an exam date. A separate Questions
mode supports automatically marked application problems with independent evidence and scheduling.

Study data lives in IndexedDB without an account. Optional device sync and web AI use encrypted
relay payloads; desktop AI connects through a local companion. Export a full JSON backup from
**Settings → Full backup & recovery** before moving devices or replacing data.

## Features

- Exam-aware revision plans, daily limits, inferred Yes/No grading and manual FSRS grades.
- Basic, Reversed and Cloze Cards, sequences and image occlusions; optional typed recall.
- Algorithm-free Simple Learn alongside scheduled revision.
- Fixed Questions and generated families with worked explanations and separate schedules.
- Markdown notes, maths, images, course search and learning analytics.
- Offline use after the application assets are available, full backups and optional device sync.
- Windows, Linux and macOS desktop beta packages, with optional AI and permission-scoped MCP tools.

## Development

Use Node.js 24 and Bun 1.4.0, matching CI. The checked-in lockfiles are authoritative.

```bash
git clone https://github.com/TJ7755/Lacuna.git
cd Lacuna
bun install --frozen-lockfile
bun run dev
```

Open the printed URL. A removable example course is seeded on first run.

```bash
bun run typecheck    # web and Electron compiler projects
bun run lint
bun run test         # unit and component tests
bun run build        # typecheck and production assets
bun run preview      # build and serve locally
bun run electron:dev # Vite and the desktop app
```

The [contributor guide](CONTRIBUTING.md) covers the complete validation matrix, relay and companion
installations, regression tests and review policy. React 19, TypeScript 7, Vite 8, Tailwind CSS v4
and Dexie form the application stack; package manifests define exact versions.

## Desktop and AI

The web app's `#/download` page selects packages for the current platform. Windows NSIS and Linux
AppImage update through the beta channel; Windows portable, Linux DEB and unsigned macOS update
manually. See [desktop setup](docs/desktop.md) for packaging, MCP access and optional AI chat.

AI is disabled by default. Enable it in Settings and copy the complete generated setup into your
MCP client. Keep Lacuna and the model task running; saving a server configuration alone does not
mean its tools are active. Writes and destructive actions require the relevant in-app approval.

## Documentation

- [Documentation index](docs/README.md): current references and historical evidence.
- [Specification](docs/SPEC.md) and [domain language](docs/domain-language.md): delivered behaviour.
- [Maintenance roadmap](docs/next_plan.md): the active work queue and rollout gates.
- [Changes](docs/CHANGES.md): release history and unreleased work.
- [Release maintenance](docs/maintenance/release.md), [security](SECURITY.md) and
  [governance](docs/maintenance/governance.md): operating and contribution boundaries.
- [Scientific assessment](docs/scientific-assessment.md): evidence and limits of learning claims.
