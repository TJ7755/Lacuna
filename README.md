# Issue 828 regression and validation evidence

Base: `acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46`.
Product implementation: `0dca2bd7a897c786784b84899f702ccc0bd7b148`.
Corrected candidate: `97142d999d5aa5e6befa5ace6297e5a79c200910` (only a test fixture timestamp changed after the implementation).

All browser content is synthetic. Hosted session and marking responses are intercepted;
no real learner data, credentials or paid provider requests appear here. Local paths are redacted.

- [Before](before.png): Not marked remains selected and the low-confidence sentence appears.
- [After](after.png): saved Unsure is selected after a reload, with no explanatory sentence. This screenshot uses the isolated implementation build on port 4428 after its animation settles; product code is identical in the corrected candidate.
- The corrected candidate's focused browser run proves leave/re-entry, reload, numeric override and preservation of learner decisions during an in-flight result. Its clean source identity is retained in `corrected-candidate-browser-source.json`.

## Review correction

The independent spec review found that the undone fixture could set `undoneAt` later than `updatedAt`, causing codec rejection before the guarded writer. The isolated test reproduced this failure locally (`review-fixture-before.txt`). The fixture now uses `attempt.updatedAt`; the isolated regression passes (`review-fixture-after.txt`). No product code changed in this correction. Fresh independent review is pending; the author does not claim approval.

On corrected candidate:

- `bun run test --maxWorkers=1 src/questions/questionSetAttemptRepository.test.ts -t 'rejects an unsure write when undone'` — 1 passed, 21 skipped.
- `bun run test --maxWorkers=2 src/jev src/questions` — 328 passed in 34 files.
- `PLAYWRIGHT_WEB_PORT=4428 bun run verify:browser -- --project=chromium tests/e2e/question-set-jev-unsure.spec.ts --workers=1` — 2 passed, clean committed source.
- `bun run typecheck` — passed (web/server/Electron).
- `bunx eslint src/questions/questionSetAttemptRepository.test.ts --max-warnings=0` — passed.

## Earlier validation

Initial regression on base runner: `bun run test --maxWorkers=1 src/jev/attempts.test.ts` — 5 failed, 23 passed; focused browser — 1 expected regression failure, 1 passed. Initial implementation focused tests — 52 passed; focused browser — 2 passed.

Implementation candidate checks:

- `bun install --frozen-lockfile`, `bun run lint`, `bun run docs:check`, `bun run changelog:check` — passed.
- `bun run test:coverage` — passed, 154 tests; `bun run test:coverage:recovery` — passed, 174 tests.
- `bun run build:assets`, `bun run release:scenario` (20 tests), `bun run perf:check` — passed.
- In `relay`: `bun install --frozen-lockfile && bun run typecheck && bun run lint && bun run test` — passed, 178 tests.
- In `tooling/handwriting-maths`: `bun install --frozen-lockfile && bun run build && bun run test` — passed, 56 tests.
- `bun run --cwd tooling/lacuna-ai-mcp typecheck`, `lint`, `test`, `build` — passed, 47 tests.

The full `bun run test:ci:unit` run reported one failure in the unchanged course restore test, then was interrupted (exit 130) when the review correction arrived. No complete suite result is claimed. The entire `src/db/courseRepository.test.ts` file passed separately on both base and implementation candidate (93 tests each); that does not establish a green full suite.

The full `PLAYWRIGHT_WEB_PORT=4428 bun run verify:browser -- --workers=1` run was interrupted before source edits: 229 passed, 22 skipped, 137 did not run, 1 interrupted (exit 130). The new Unsure tests and existing Question Set desktop/phone light/dark layouts passed within that run. This is partial evidence, not a full browser pass. No full matrix rerun was claimed after the fixture-only correction; CI must run the complete required checks.

Platform coverage: macOS host; Chromium focused and partial full web runs. WebKit mobile did not run before interruption. Windows/Linux native, macOS Electron, packaging, signing and notarisation were not exercised; this change does not touch those boundaries. Bun `1.4.4+38afee6c8`, Node `v26.12.1`. Commands/results and raw redacted logs are retained alongside this record.
