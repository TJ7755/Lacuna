# Share import navigation evidence for #818

Base: `acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46`. Candidate: `10404bf289c701ab8abc774808d28f563885f354`.

All screenshots use a disposable profile, synthetic biology content and a local in-memory relay.
No live courses, production writes, credentials or personal learner data are included.

Before screenshots show the successful import toast while the learner remains on Shared course.
After screenshots show the imported Course heading focused, with Study available. Browser assertions
verify the recorded local Course destination, heading focus, viewport visibility and opening Session preview.
Desktop width is 1280px; phone viewport width is 390px. Both run Chromium on macOS, not phone hardware.

The base plus regression tests failed in both viewports. The committed candidate passed all ten focused
browser scenarios. `source.json` records the clean candidate and isolated build identity; local path prefixes
have been redacted. The focused component/import/link-store tests passed 49 tests. Typecheck, lint,
documentation links and changelog fragment checks passed. Full CI and independent review remain required.

The existing navigation contract remains in `docs/spec/navigation.md`: preserve the learner's chosen
destination and focus while asynchronous work settles. The implementation applies that contract to this
entry point. Import data, exam dates, enrolment, persistence formats and security policy are unchanged.

Files: `before-1280.png`, `after-1280.png`, `before-390.png`, `after-390.png` and sanitised command logs.

Exact final checks:

- `bun install --frozen-lockfile` — pass; root, relay and tooling/handwriting-maths installs; unchanged lockfiles.
- `bun run test -- src/pages/ShareLinkPage.test.tsx src/components/import/SharedCourseImport.test.tsx src/components/import/SharedCourseImport.codes.test.tsx src/shareLinks/linkStore.test.ts --maxWorkers=1` — pass: 49 tests across 4 files.
- `bun run typecheck` — pass: web, server and Electron TypeScript checks.
- `bun run lint` — pass: zero warnings and no untracked import cycles.
- `bun run docs:check` — pass.
- `bun run changelog:check` — pass: 173 fragments.
- `PLAYWRIGHT_WEB_PORT=4418 bun run verify:browser -- --project=chromium share-links.spec.ts shared-course-import-action.spec.ts --workers=1` — pass: 10 tests against a clean committed source; isolated build; desktop/phone Study access plus share/class update regressions.
- `git diff HEAD --check` — pass.
