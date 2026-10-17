# Study note disclosure latency, 17 October 2026

Measured in Chromium at `http://localhost:5397`, 1280 × 800, normal motion,
in the `redesign/direction-c` worktree. The owner's History course was unavailable
in the automation profile. A representative course was created through
`createCourse`, `createLesson` and `createNote`, then opened through the normal
`/lesson/:lessonId/learn` notes screen. Its four initially open sections each
contained a 16-row, three-column Markdown table with bold text, a branched
12-node Mermaid flowchart and KaTeX maths.

## Measurements

Real browser clicks were observed from capture-phase `pointerdown`. A
`requestAnimationFrame` followed by a zero-delay task sampled the section's
height after animation callbacks. The first change exceeding 2px was recorded;
this excludes the original disclosure's newly mounted 1px border. Each click
was followed by 800ms to finish the transition. A MutationObserver recorded
child replacement, and the original content node was compared after toggling.
These are browser timing samples, not a universal hardware latency guarantee.

Before the disclosure fix, with the separate Mermaid fixes applied so all four
diagrams rendered correctly:

- Opening: 21.70, 18.29, 18.98ms; median **18.98ms**.
- Closing: 29.84, 13.12, 27.04ms; median **27.04ms**.
- Reopening mounted new content at 6.5–9.1ms and replaced Mermaid output at
  63.3–112.4ms. Opening frame intervals included 24–28ms gaps.

After the disclosure fix:

- Opening: 12.33, 13.30, 12.16ms; median **12.33ms**.
- Closing: 13.03, 12.46, 11.44ms; median **12.46ms**.
- Every toggle changed height in the first sampled rendering opportunity.
- All six toggles retained the same content node and made no child replacements.

## CPU profile evidence

Chrome DevTools Protocol's `Profiler` sampled six toggles at a requested 100µs
interval, starting after the initial diagrams finished rendering. Separate
browser contexts used the same representative content. The original study view
was restored temporarily for the baseline; the fixed view was restored afterwards.
No concurrent agent's files were replaced.

Inclusive sampled CPU time beneath these functions/modules:

- Mermaid rendering and sanitisation: **112.8ms before, 0ms after**. DOMPurify
  accounts for 45.3ms within the original total; these figures must not be added.
- `AnnotatedNoteContent`: **19.0ms before, 0ms after**.
- Motion `measureInitialState` and `measureEndState`: **1.8ms before, 0ms after**.
- No Markdown parsing was sampled in either toggle profile. The existing HTML
  cache already avoids repeating the Markdown/KaTeX pipeline for cached sources.

The captured profiles are `/tmp/lacuna-notes-before.cpuprofile` and
`/tmp/lacuna-notes-after.cpuprofile`. They can be loaded in Chrome DevTools.

The regression tests confirm that the old view renders all three sibling bodies
again when one section closes. Reopening remounts the annotation view and Mermaid
effect. Retaining memoised bodies, keeping state local to each section and caching
natural disclosure heights removes this work. Mouse activation starts on press;
keyboard and touch retain native click activation. The original expansion spring
and speed multipliers remain in use.

## Empty diagram reproduction

The representative lesson reproduced an empty `.lacuna-mermaid-rendered` element
followed only by `Diagram source`. Concurrent renders reused the same
`Date.now()`-based SVG ID. Mermaid removes an existing SVG with that ID when it
starts another render. A sequence counter now distinguishes every render,
including theme updates. The same-millisecond regression test originally found
one unique ID across four renders; it now finds four.

Labels containing commas, en dashes, em dashes and question marks render correctly,
as do quoted labels containing parentheses. An unclosed label and an unsupported
diagram type instead leave readable source with `data-mermaid-error="true"` and
the existing warning border, without a source-only disclosure. This is a rendering
bug, not evidence that the owner's source is invalid; their exact source remains
unavailable.

A separate development-server problem was also reproduced: excluding Mermaid
from Vite optimisation left its CommonJS `dayjs` dependency unbundled. The import
failed with `SyntaxError: The requested module '/node_modules/dayjs/dayjs.min.js?v=e6880e9c' does not provide an export named 'default'`.
Pre-bundling Mermaid fixes it. The existing `markdown-diagrams.spec.ts` failed
against the running dev server before this change and passed afterwards.

## Regression and validation evidence

Expected red assertions on the original implementation, preserved verbatim:

- Sibling render test: `AssertionError: expected "vi.fn()" to not be called at all, but actually been called 3 times`.
- Closed-content accessibility: `AssertionError: expected null not to be null`.
- Cached height: `AssertionError: expected 'auto' to be '120px' // Object.is equality`.
- Mermaid render IDs: `AssertionError: expected 1 to be 4 // Object.is equality`.
- Existing browser diagram test: `Error: expect(locator).toBeVisible() failed`,
  `Locator: locator('pre.lacuna-mermaid[data-mermaid-rendered]').locator('svg')`,
  `Error: element(s) not found`.

The new tests also cover primary mouse press without double activation, native
touch activation and cancellation, secondary mouse presses, retained annotation
drafts, closed-panel resize tracking, observer cleanup and instant reduced motion.

Final checks passed:

- `bun run typecheck:web`.
- `bunx eslint` on all changed TypeScript files.
- `bunx prettier --write` followed by `bunx prettier --check` on all changed files.
- `bunx vitest run` on the disclosure, study notes, notes intro, annotated content,
  Markdown, Mermaid and affected Settings tests: **51 tests across 12 files**.
- `bunx playwright test -c /tmp/lacuna-notes-playwright.config.ts`: the existing
  `tests/e2e/markdown-diagrams.spec.ts` against port 5397, **1 passed**.
- `bun run changelog:check`.

No remaining validation failures. The Playwright runner emitted the environment
warning `Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.`
The Vite server remained available on port 5397; its normal configuration reload
handled the dependency-optimisation change without stopping the process manually.
