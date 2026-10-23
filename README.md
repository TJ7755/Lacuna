# Issue 827 marking rail alignment evidence

Synthetic translation fixture only; both hosted endpoints are intercepted. No learner data,
real credentials, traces or browser profiles are included.

Base: `acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46`. Candidate: `329de4f06a416dd2db0c410de3602e2f6ad58a01`.

The before run uses base production code with the new regression test. It fails both motion cases:
the selected group is 15px left of centre, selected option height is 54px versus 46px,
and the other labels sit 4px above the rail centre. The after run passes all six cases;
settled group and rail offsets are zero and every option is 40px high. Normal-motion
verdict measurements capture the indicator while it grows; reduced-motion shows it at rest.
Each before/after motion directory contains pending, verdict, settled, manual-zero,
manual-unsure and manual-one screenshots plus geometric measurements.

The browser runs recorded staged local changes on the base. The after patch fingerprint
`cc0949a25beb73146dedfbaf8bee07001bc42946e277783db46adce8cff9a09d` matches `git diff acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46 329de4f06a416dd2db0c410de3602e2f6ad58a01 --full-index` exactly.
This is evidence for the committed source tree, not a clean-commit release-matrix pass.

Commands and results:

- `bun install --frozen-lockfile`: pass, pinned Bun 1.4.4+38afee6c8; Node v26.12.1.
- `PLAYWRIGHT_WEB_PORT=4427 bun run verify:browser -- --project=chromium tests/e2e/question-set-marking-alignment.spec.ts --workers=1`: before, 2 failed on alignment assertions.
- `PLAYWRIGHT_WEB_PORT=4427 bun run verify:browser -- --project=chromium tests/e2e/question-set-marking-alignment.spec.ts tests/e2e/question-set-attempt-layout.spec.ts --workers=1`: after, 6 passed.
- `bun run test -- src/pages/QuestionSetPractice.test.tsx src/pages/QuestionSetEditor.test.tsx src/components/question-sets/QuestionSetPicker.search.test.tsx --maxWorkers=1`: 3 files, 50 tests passed.
- `bun run typecheck`: pass (web, server and Electron).
- `bun run lint`: pass, zero untracked import cycles.
- `bun run docs:check`: pass.
- `bun run changelog:check`: pass, 173 valid fragments.
- `git diff --check`: pass.

Browser platform: macOS host, Chromium desktop 1440x900, light theme, normal/reduced motion;
existing attempt layout also passes at 1280x800 and 390x844 in light/dark themes.
Native Windows, Linux and macOS execution, WebKit, physical devices, packaging,
and the complete CI matrix were not run locally. This CSS-only correction changes no data,
AI authority, transport or release contract. CI must run its full required matrix for src changes.
Independent review and CI remain required; the author does not claim approval.
