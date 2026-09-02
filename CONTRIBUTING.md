# Contributing to Lacuna

Lacuna is a local-first learning application. Changes to persistence, synchronisation, import/export,
the Electron boundary, AI authority or release packaging can affect a learner's only copy of their
work. Keep changes narrow, prove behaviour, and make the risk legible to a human reviewer.

## Before you start

Use Bun 1.4.0, matching CI. Check it before installing anything:

```bash
bun --version
```

The repository's `bun.lock` files are authoritative. Do not use npm or Yarn, and do not regenerate a
lockfile with a different Bun release.

```bash
git clone https://github.com/TJ7755/Lacuna.git
cd Lacuna
bun install --frozen-lockfile
(cd relay && bun install --frozen-lockfile)
(cd tooling/handwriting-maths && bun install --frozen-lockfile)
```

The standalone AI MCP tool intentionally uses the root installation: it has no separate lockfile and
CI does not install from that directory. Run its checks from the repository root after the root
install has completed.

## Required checks

Run the checks relevant to the files you changed. A release, dependency, persistence, synchronisation,
Electron, relay or AI change requires the complete matrix below.

```bash
# Root
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test:ci:unit
bun run test:coverage
bun run build:assets
bun run release:scenario
bun run perf:check
bunx playwright install --with-deps chromium
bun run test:e2e:web

# Relay
(cd relay && bun install --frozen-lockfile && bun run typecheck && bun run lint && bun run test)

# Handwriting maths tool
(cd tooling/handwriting-maths && bun install --frozen-lockfile && bun run build && bun run test)

# Standalone AI MCP tool (uses root node_modules)
bun run --cwd tooling/lacuna-ai-mcp typecheck
bun run --cwd tooling/lacuna-ai-mcp lint
bun run --cwd tooling/lacuna-ai-mcp test
bun run --cwd tooling/lacuna-ai-mcp build
```

The native Electron check is part of CI on Windows and must be run there for native, packaging or
managed-device changes:

```bash
bun run test:e2e:electron-ai
bun run electron:build:win
```

The configured Linux and macOS packages must also be built for release or packaging changes:

```bash
bun run electron:build:linux
bun run electron:build:mac
```

On macOS and Linux, record which package targets were built. Unsigned macOS output is not evidence of
successful signing or notarisation. Keep the release artefact allowlist intact.

## Behaviour and review policy

Every intentional behaviour change has a red-to-green test: identify or add an assertion that fails
on the merge base and passes on the proposed head. Do not weaken an assertion to obtain a green run.
Pure refactors retain relevant coverage. Documentation, dependency and CI-only changes need
proportionate validation and a note explaining what was checked.

Prefer one invariant or one user workflow per pull request. Agent-produced changes follow the same
rule. State the permitted files or module ownership, and require a human to review data,
synchronisation, AI authority, Electron security and release changes. The authoring agent cannot be
the independent reviewer; that would be the model checking whether it still agrees with itself.

The soft target is 300–600 net changed lines. Generated fixtures, migration snapshots and mechanical
movement can justify more. More than about 1,000 handwritten changed lines requires a written reason
and normally belongs in a split. Do not combine unrelated dependency majors or a visual redesign with
a security or data-safety change.

## Stacked pull requests

Use a stack when a change has genuinely independent layers. Each pull request must have one parent
branch, one coherent invariant, and a description of its position in the stack. Keep later pull
requests based on the immediately preceding branch so their diffs remain reviewable. Use the native
`gh stack` workflow to initialise, add, submit and rebase the stack; GitHub retargets surviving upper
layers when a lower layer merges. Do not recreate the chain by hand or hide unrelated fixes in a
stack merely to make the queue look tidy.

Every pull request must state:

- the user outcome and explicit non-goals;
- the invariant or workflow being changed;
- persisted-data, backup/import, wire-format and security impact;
- exact commands and results used as evidence;
- the web, Windows, Linux and macOS platform matrix that was or was not exercised;
- unresolved review conversations, if any (there should be none before merge).

Use the pull request template. Screenshots are required for material UI changes. Resolve all review
conversations and obtain one approving human review before merging risk-bearing work. Branch
protection, required checks and CODEOWNERS are repository controls; a green local run does not replace
them.

## Dependency updates

Dependabot groups root runtime, Electron/release, test, relay, handwriting and GitHub Actions updates.
Keep security fixes in their own small pull request where that makes the audit delta clearer. Review
the lockfile, run `bun audit` for the root and relay, and record any remaining critical or high finding
with an owner and review date. Never add a permanent blanket ignore.

## Commit and language conventions

Use a concise imperative commit subject and explain migration or compatibility consequences in the
body when relevant. Write British English. Do not add emojis, TODO placeholders or unrelated cleanup.
