# Gaps teacher journey

## Design plan and critique

The teacher's task is to connect a class, give pupils a code, then understand their reports.
The original independent connection, key and reporting panels expose implementation boundaries
as competing jobs. Keep those boundaries in code and make the class the unit of navigation.

Use Lacuna's existing tokens throughout. Default dark palette: paper `#0a0b09`, surface
`#1f2518`, ink `#f0fbd9`, accent `#d4ff3d`, muted ink `#d0d5c3` (rounded token values).
These are references, not new CSS colours; theme and accent preferences remain authoritative.
Use the existing Space Grotesk for headings and Instrument Sans for instructions and controls.
Keep the established rounded SectionCard, Field and button primitives and their control feedback.
No new fonts, dependencies, ornamental motion or global theme changes.

Left-align content. A compact header identifies Gaps. The home view pairs a class list or a
single connection task with a quieter explanation of the actual three-step sequence.
Inside a class, replace the list with its workspace; close returns to the list and locks it.

```text
Gaps / Daily class reports                         Open Lacuna
Your classes                         How a class works
[Connect a class]                     1 Connect a class
[class name             Open class]  2 Give pupils a code
                                     3 Read daily results

Selected class                         Close and lock
[Connect complete | Share | Read]
[one current task, with its next action]
[setup / recovery only when needed]
```

Critique before implementation: a blue-and-white identity would split Gaps from Lacuna and
contradict the user's follow-up. Replaced it with existing theme tokens and primitives.
Equal-sized dashboard cards would preserve the rejected hierarchy. Use one work area and
progressive disclosure instead. Do not decorate the page as a marketing landing page or invent
participation metrics. A returning teacher needs results first; sharing remains an explicit,
visible alternative. A new connection gets an immediate route into class setup.

## Choice architecture rationale

[Thaler, Sunstein and Balz, Choice Architecture (2010)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1583509)
identifies defaults, expecting error, understanding mappings, feedback and structuring complex
choices. The supplied abstract was verified by the parent; direct retrieval here returned 403.
[Harvard Law School's discussion with Sunstein and Thaler](https://hls.harvard.edu/today/intelligent-design/)
was read directly and supports comprehensible options, feedback and preserving easy exits.
These are design heuristics, not evidence of a measured usability improvement.

- Structure choices: connect, share and read are one class journey. Recovery is available without
  being a competing first task. Class-specific setup carries the course identifier through.
- Understand mappings: explain each file beside its input and explain why the two passphrases
  remain separate. Pupils receive only a class code or join link.
- Expect error: keep cancelled work reversible, retain actionable wrong-file/passphrase errors,
  offer setup when a saved key is missing, and confirm local connection removal.
- Give feedback: distinguish verified connection, saved key, requested download, published code,
  unlocked class, completed fetch and an empty day. Never claim a download was saved to disk.
- Safe defaults: latest completed UTC day, explicit unlock and read, and results as the returning
  task. No consent, reporting gates, encryption, persistence or transport changes.
- Preserve choice: visible cancel, back, close and lock, recovery and local removal. No pressure,
  social proof, default-on reporting or hidden destructive actions.

## Screenshot critique and revisions

The first pass retained Lacuna’s palette and primitives, but duplicated the journey with a second
row of task controls. Combined these into an interactive journey, with the same secondary and
pressed button treatments used elsewhere in Lacuna. The selected task is not a claim that all
previous tasks have been completed. Removed technical item identifiers from the main evidence
view; they remain available under Item details. Limited explanatory line lengths on desktop.

At 390px the first form expanded instructions even when the teacher already had a file. Kept the
instructions available on request and focused the file input on opening. Prevented Open Lacuna
from wrapping. Checked light theme and reduced motion with keyboard entry and cancellation.
Success screens originally kept the previous action dominant. After a recovery download request,
Continue to class becomes primary; after publishing, Copy class code becomes primary. Recovery
copy now distinguishes choosing a new passphrase from using the existing one.

These screenshots contain local test fixtures, not real pupil records. The report comes from the
end-to-end test pupil’s recorded recall activity; the application ships no sample reports.

| State | Desktop | 390px |
| --- | --- | --- |
| First class | [Home](home-desktop.png) | [Home](home-mobile.png) |
| Saved classes | [Class list](classes-desktop.png) | [Class list](classes-mobile.png) |
| Connection, light theme | — | [Connection form](connect-light-mobile.png) |
| No reports for the day | [Empty day](empty-results-desktop.png) | [Empty day](empty-results-mobile.png) |
| Recorded pupil evidence | [Report](daily-report-desktop.png) | [Report](daily-report-mobile.png) |

Additional states: [saved protection](class-protected.png), [explicit unlock](unlock-class.png),
and [class code ready](share-class-code.png). Earlier UI evidence remains in
[course connection](../gaps-course-connection/README.md) and
[daily reports](../gaps-daily-reports/README.md).

## Validation

- `bun install --frozen-lockfile`: passed with Bun 1.4.3; no dependency or lockfile changes.
- `bun run typecheck`: passed (web, server and Electron). After the final copy change,
  `bun run typecheck:web` passed again.
- `bun run lint`: passed. After the final copy change, targeted ESLint over `src/teacher`,
  `src/pages/TeacherHome.test.tsx`, `src/build/gapsBuild.test.ts` and the four changed Gaps
  browser specs passed with `--max-warnings=0`.
- `bun run test -- src/teacher src/pages/TeacherHome.test.tsx src/build/gapsBuild.test.ts --maxWorkers=1`:
  32 tests passed. The build test retains the module allowlist, no learner runtime/workers,
  initial JavaScript gzip below 80,000 bytes and combined JavaScript gzip below 150,000 bytes.
- `bun run build:gaps`: passed. Both browser commands also rebuilt their own isolated output.
- `PLAYWRIGHT_WEB_PORT=4391 bun run verify:browser -- --gaps --project=chromium --workers=1 tests/e2e/gaps-standalone.spec.ts tests/e2e/gaps-course-connection.spec.ts tests/e2e/gaps-teacher-keys.spec.ts`:
  7 passed, including desktop/390px, fresh-browser recovery, wrong passphrase, local removal,
  preserved learner storage, light theme, focus and cancellation.
- `VITE_GAPS_REPORTING_ENABLED=true PLAYWRIGHT_WEB_PORT=4392 bun run verify:browser -- --project=chromium --workers=1 tests/e2e/gaps-daily-flow.spec.ts`:
  1 passed, covering protected recovery download, continuation, explicit unlock/publication,
  an empty day, pupil consent, encrypted delivery, recorded evidence and close/lock.
  The flag applied only to this local test process. Production flags were not changed.
- `bun run docs:check`, `bun run changelog:check`, and `git diff --check`: passed.

[Verification identities](verification.json) record the final frozen dirty candidates, both based
on the merged midnight fix. Source, staging and commit remained unchanged during each run.
Only captured evidence and this rationale were updated afterwards. This is local candidate
validation, not deployment or release approval. Screenshots were inspected directly. The T3
preview supported navigation, connection opening and cancellation, but screenshot calls twice
returned `Preview automation snapshot timed out after 15000ms.` Captures therefore come from the
required isolated browser workflow.

Red-to-green evidence: before changing TeacherClassReports, the two added regressions failed
with the original component: missing-key errors had no actionable setup button, and publication
was displayed alongside results after unlock (2 failed, 2 existing tests passed). Both now pass.
Additional regression coverage checks one selected workspace, focus on return, contextual
recovery-file rejection before restore, confirmed removal and an actionable empty reporting day.
No assertions about encryption, pupil consent, request contents or storage isolation were removed.
A focus assertion was changed to wait for React’s effect; the browser flow also asserts focus.

Web Chromium was exercised on macOS at desktop and 390px. Native Windows, Linux and macOS
packages, real relay deployment and AI MCP were not exercised: this change owns teacher
presentation only. The daily test uses the existing in-memory relay handler.

## Boundaries and remaining trade-offs

Two files and two passphrases remain necessary. The UI does not combine, persist or send them.
It cannot confirm that a browser download was saved safely; the message asks the teacher to check.
A new browser needs both connection and recovery material. No saved-key existence check runs on
startup, so a returning class exposes first-time/recovery help before unlock and an actionable
route after a missing-key error. No verified identity, attendance or participation count is inferred.
The daily UTC boundary, no-backfill rule, pupil opt-in and relay retention remain unchanged.
No production reporting, deployment, Vercel or domain changes were made.

This stays in one workflow PR despite exceeding the usual handwritten change target: splitting
class selection, contextual protection and report navigation would leave the rejected competing
panels in place between layers. Existing report rendering and security calls are retained; much
of the report diff is the indentation needed to place it behind one selected task. Teacher-only
layout, focused regression tests and review evidence account for the additional files.
