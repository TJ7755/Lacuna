# Issue 827 marking rail alignment evidence

Synthetic translation fixture only; both hosted endpoints are intercepted. No learner data,
real credentials, traces or browser profiles are published.

Base: `acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46`.
Superseded candidate: `329de4f06a416dd2db0c410de3602e2f6ad58a01`.
Corrected candidate: `128f618ba9bbcdecc9e0e90ad0fa913ba6fc4a1b`.

The correction removes the Flow-specific 40px minimum-height override, allowing the existing
44px choice-face minimum to apply. The clickable label encloses that face. The regression measures
each label's own bounding rectangle and requires both dimensions to be at least 44px in pending,
verdict, settled, manual-zero, manual-unsure and manual-one states, under both motion preferences.

Evidence directories:

- `before/` and `before.log`: retained original base alignment failure. The selected group was
  15px left of centre, selected option height was 54px versus 46px, and other labels were 4px above
  the rail centre. These are historical comparisons, not validation of the corrected candidate.
- `hit-area-before/` and `hit-area-before.log`: superseded candidate production code plus the new
  minimum-label-hit-area assertions. Both motion cases fail: all 48 label-height assertions across
  the twelve captures report 40px against the required 44px. The normal-motion case also captured
  a transient verdict group offset of 2.100006px against its existing 2px tolerance. No assertion
  tolerance or animation code was changed for the correction.
- `after/` and `after.log`: clean corrected commit; six browser cases pass without retries,
  skipped cases or source changes. All label hit heights are exactly 44px; the narrowest label is
  60.4375px wide. Settled text, group, indicator and rail offsets are zero in both motion cases.
  The normal-motion verdict capture measures the indicator at 13.9423828125px as it approaches its
  settled 14px width. Pending pulse and manual keyboard changes retain their assertions.

Each marking motion directory contains six state screenshots and `measurements.json`.
`source.json` retains source identity and `summary.json` retains test results. The local full browser
reports remain in the isolated run directories; traces are deliberately excluded from public evidence.
Public paths in logs and metadata are normalised to `<worktree>`; source hashes and measurements
are unchanged. Old dirty-run source metadata remains labelled historical. The corrected browser run
has empty source status and empty-patch SHA-256 before and after, commit
`128f618ba9bbcdecc9e0e90ad0fa913ba6fc4a1b`.

Commands rerun for this correction (Bun `1.4.4+38afee6c8`, Node `v26.12.1`):

- `PLAYWRIGHT_WEB_PORT=4427 bun run verify:browser -- --project=chromium tests/e2e/question-set-marking-alignment.spec.ts --workers=1`: superseded candidate plus regression; 2 failed as above.
- `PLAYWRIGHT_WEB_PORT=4427 bun run verify:browser -- --project=chromium tests/e2e/question-set-marking-alignment.spec.ts tests/e2e/question-set-attempt-layout.spec.ts --workers=1`: corrected clean commit; 6 passed.
- `bun run test -- src/pages/QuestionSetPractice.test.tsx src/pages/QuestionSetEditor.test.tsx src/components/question-sets/QuestionSetPicker.search.test.tsx --maxWorkers=1`: 3 files, 50 tests passed.
- `bun run typecheck`: pass (web, server and Electron).
- `bun run lint`: pass; no untracked import cycles.
- `bun run docs:check`: pass.
- `bun run changelog:check`: pass, 173 valid fragments.
- `git diff --check HEAD~1 HEAD`: pass.

`install.log` is retained from the original implementation, not a fresh install for this correction.

Browser platform: macOS host, Chromium desktop 1440x900, light theme, normal/reduced motion;
existing attempt layout also passes at 1280x800 and 390x844 in light/dark themes.
Native Windows, Linux and macOS execution, WebKit, physical devices, packaging,
and the complete CI matrix were not run locally. No data, AI authority, transport or release
contract changes. CI must run its full required matrix for source changes.

First-round standards review requested the minimum-hit-area correction; the old candidate's spec
PASS does not approve this new SHA. Fresh independent review is required and belongs to the parent.
No merge, review approval, conversation resolution or CI result is claimed here.
