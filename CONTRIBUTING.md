# Contributing to Lacuna

Lacuna is a local-first learning application. Changes to persistence, synchronisation, import/export,
the Electron boundary, AI authority or release packaging can affect a learner's only copy of their
work. Keep changes narrow, prove behaviour, and make the risk legible to a reviewer.

## Before you start

Use the exact Bun release in `.bun-version`, matching CI. The verified bootstrap checks its
archive checksum and full revision; use it when installing Bun for a fresh checkout.
Use Node 22.23.4, 24.22.1 or 26.12.1 or a newer supported patch release. Check before installing:

```bash
bun --revision
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

## Finding code and delegating work

Use the small [entry-point index](docs/README.md), then read the owning source, callers and tests.
Discover filenames before guessing paths: `rg --files src tests | rg 'apkg|share|lineage'`, then
`rg -n 'symbol' <existing-directory>`. Read issue titles first, then selected bodies and their parent
briefs; avoid dumping an entire issue queue or unrelated files into context.

A delegated brief names the repository/worktree, base and candidate commits, permitted files,
relevant tests, and neighbouring ownership. Supply existing absolute paths for local evidence,
especially across repositories; verify them before dispatch. A worktree starts from committed
source and does not inherit a parent's uncommitted evidence. Do not put private-machine paths in
public project documentation.

For concurrent browser validation, stage intended new files and run
`PLAYWRIGHT_WEB_PORT=4317 bun run verify:browser -- --project=chromium <spec>`.
Each run builds once into `artifacts/browser-checks/run-*/dist`, refuses an occupied port, and
retains source identity, dirty patch fingerprint, HTML/JSON reports and test evidence beside it.
A failed build/test or changed source fails the command. A dirty run identifies the local candidate,
not a clean-commit release pass. Delete old run directories when their evidence is no longer needed.
The ordinary web/CI commands retain their existing configuration; a different port alone does not
isolate their build output. Keep Electron builds in a separate checkout from active web verification.

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
bun run test:coverage:recovery
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

`bun run lint` covers `src`, `server`, `electron`, `tests`, `api`, `scripts`, `tooling` and the root config files, and fails on warnings. `tooling/lacuna-ai-mcp` and `relay` have their own flat configs and lint scripts.

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

Pull requests that change only documentation skip heavy CI work. Each suite run still checks
repository file links and changelog fragments in the documentation job; its result feeds the
required aggregate test gate. Run `bun run docs:check` and `bun run changelog:check` locally after
documentation changes.
A change is documentation-only when every path is under `docs/` or `.github/ISSUE_TEMPLATE/`,
is `.github/PULL_REQUEST_TEMPLATE.md`, or is a Markdown file in the repository root. Markdown under
`src/`, `tooling/` or `public/` is not, because code consumes it. Pushes to master always run everything.
The rule lives in `scripts/ci-change-scope.mjs`.

Required worker jobs acknowledge documentation-only scope on a runner so GitHub resolves their
required check names; their install/check steps and non-required heavy jobs remain skipped.

Title/body-only PR edits do not repeat validation or cancel its current run. They reuse the latest
successful CI validation run for the exact test merge commit and PR head, waiting if necessary.
The validation run identity is recorded in the changes job summary. Missing, failed or cancelled
validation fails closed; reopen the PR or push a commit to establish validation after adopting this
workflow. The test and browser gates reject failed reuse even when their other dependencies skip.

Metadata runs retain the ordinary required names because a newer suite with separate names can
block a checked head despite successful older contexts. Reuse is allowed only after actual validation;
metadata acknowledgements alone cannot approve untested code. Base changes, mixed and unknown edits
run validation against the new merge commit. Keep event predicates, run names, check names and
concurrency together when editing `.github/workflows/ci.yml`.

The aggregate test and browser jobs report dependency results in their job summaries. Browser test
summaries also include each failed attempt's deepest failing step and source location, including
prerequisite navigation and labelled setup stages. Retries and expected failures are labelled;
HTML reports, JSON and retained failure traces remain the detailed evidence. The narrow CI predicate,
gate and no-browser reporter probes run in the first unit shard.

## Behaviour and review policy

Pure refactors retain relevant coverage. Documentation, dependency and CI-only changes need
proportionate validation and a note explaining what was checked.

Record each user- or maintainer-visible change as a fragment file in `docs/changes/unreleased/`
(see its README) rather than editing `docs/CHANGES.md`, which is assembled at release time.
`bun run changelog:check` validates fragments.

Prefer one invariant or one user workflow per pull request. Agent-produced changes follow the same
rule. State the permitted files or module ownership, and require an independent agent to review data,
synchronisation, AI authority, Electron security and release changes. The authoring agent cannot be
the independent reviewer; that would be the model checking whether it still agrees with itself.
For agent-authored PRs with risk, use a subagent to validate and review.

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
conversations and obtain one approving independent review from an agent or human before merging
risk-bearing work. Human review is optional. Branch protection, required checks and CODEOWNERS are
repository controls; a green local run does not replace them.

## Security maintenance

[TLS trust maintenance](docs/maintenance/tls-trust.md) covers the verified Bun runtime pin,
certificate checks and the separate machine, deployment and desktop rollout steps.

[Security automation](.github/workflows/security.yml) owns audit workspaces and configuration.
High/critical findings fail the gate; moderate findings remain visible rather than being hidden
by blanket ignores. Review scheduled output and current advisory evidence before beta releases.
Static analysis, provenance and checksums do not replace native behaviour or signing evidence.
Inspect GitHub enforcement through [governance](docs/maintenance/governance.md).

## Dependency updates

Dependabot groups root runtime, Electron/release, test, relay, handwriting and GitHub Actions updates.
Keep security fixes in their own small pull request where that makes the audit delta clearer. Review
the lockfile, run `bun audit` for the root and relay, and record any remaining critical or high finding
with an owner and review date. Never add a permanent blanket ignore.

## Commit and language conventions

Use a concise imperative commit subject and explain migration or compatibility consequences in the
body when relevant. Write British English. Do not add emojis, TODO placeholders or unrelated cleanup.
