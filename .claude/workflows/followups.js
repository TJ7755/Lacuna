export const meta = {
  name: "followups",
  description: "Review PR 77, add Path test coverage, and correct two stale doc/test gaps",
};

const RULES = `Read AGENTS.md first: British English, no emojis, no subagents, no unrequested
features, report real command output. Run \`bun run typecheck:web\`, \`bun run lint\` and
\`bun run test\` and report real counts. Confirm with \`git rev-parse HEAD\` and
\`git branch --show-current\` where you are before trusting any output.`;

const REVIEW = `${RULES}

# Read-only review of PR #77

**Change nothing. Do not commit or push.** Your final message is the review.

Branch \`feat/card-list-toolbar\` is checked out in another worktree — do not switch to it. Use
\`git diff master..feat/card-list-toolbar\` and \`git show\`.

It replaces six equal-weight toolbar buttons in \`CardList\` with one primary **New card** plus a
new \`src/components/ui/Menu.tsx\` popover holding New sequence, New occlusion, Link existing cards
and Import cards. \`Select\` drops to a ghost button.

Test these claims:

1. **Nothing became unreachable.** Every action available before must still be reachable. Check each
   caller of \`CardList\` and confirm the props it passes still surface. Import is a toggle, not a
   create — confirm its inline panel still opens and closes and that the label reflects state.
2. **The Menu is correct as a control.** Keyboard: Enter/Space/ArrowDown/ArrowUp open, arrows wrap,
   disabled items are skipped, Escape closes and returns focus, Tab closes, outside pointer closes.
   Check \`aria-haspopup\`, \`aria-expanded\`, \`aria-controls\`, \`role="menu"\`/\`menuitem\`.
   Is there a focus trap problem, or a case where the menu stays open with focus lost?
3. **The 10 Menu tests would actually fail if the behaviour broke.** Pick two and reason about what
   change would slip past them. Say which behaviours are asserted and which only appear to be.
4. **The Button mock change** in \`CardList.test.tsx\` now spreads \`...rest\`. Confirm that does not
   let a test pass for the wrong reason.
5. **Does it look native?** Compare against the Dashboard header (\`Courses\` + \`New course\`) and
   existing Lacuna surfaces. Flag anything that reads as imported from elsewhere.
6. Anything else wrong.

Report: verdict (\`merge as is\` / \`merge after fixes\` / \`do not merge\`), findings by severity with
file and line, verified clean, real command output. If nothing is wrong, say so; do not manufacture
findings.`;

const PATH_TESTS = `${RULES}

# Add the missing Path test coverage

Branch \`test/course-path-coverage\` from master. Commit granularly. Do not push, do not open a PR.

\`src/pages/CoursePath.tsx\` and \`src/components/course/CoursePathSegment.tsx\` have **no test files
at all**, despite being the two files most central to a bug class that shipped today.

PR #75 gated seven authoring controls behind the \`authoring\` flag (Read vs Edit mode). A reviewer
found that **five of those seven gates have no test that would notice a revert** — of 1,980 tests,
only two would fail if the gate were removed.

Close that. Create \`CoursePath.test.tsx\` and \`CoursePathSegment.test.tsx\` covering, for each
gated control, **both** sides: absent in Read mode, present and functional in Edit mode.

The controls: start/end \`InsertGap\` (Manual practice), mid-path \`InsertButton\`, the practice-node
pencil, Add lesson on empty and populated paths, and the course title rename.

**Prove each test can fail.** For at least three, temporarily remove the \`authoring\` condition,
confirm the test goes red, and revert. Report what you saw. A gate test never observed failing is
not protecting anything.

Follow the conventions in \`LessonView.test.tsx\` and \`LessonNode.test.tsx\`. Tests only — change no
production code. If a control cannot be tested without a production change, say so and leave it.`;

const DOC_FIX = `${RULES}

# Two small corrections

Branch \`docs/path-copy-and-lock-test\` from master. Commit granularly. Do not push, do not open a PR.

1. **\`docs/APP-FLOWS.md\` line ~241** says the Manual practice controls "appear on hover, focus, and
   touch". They do not: \`InsertButton\` in \`CoursePathSegment.tsx\` is a persistent labelled pill.
   Correct the wording to match the code. Check the surrounding paragraphs for the same claim
   repeated elsewhere and fix those too. Do not change behaviour.

2. **\`src/db/../course/lessonViewMode.test.ts\`** (find it; it is the test file for
   \`src/course/lessonViewMode.ts\`) never asserts the case that matters most for shared courses: a
   **locked** distributed copy that also has \`lessonViewMode: 'edit'\` must still resolve to
   \`'study'\`, so \`isLessonAuthoringMode\` is false. Add that case, and prove it can fail by
   temporarily removing the early return in \`resolveLessonViewMode\`, watching it go red, and
   reverting. Report what you saw.

Nothing else. If you spot other stale claims, list them in your report rather than fixing them.`;

phase("Follow-ups");
const [review, tests, docs] = await parallel([
  { prompt: REVIEW, worker: "grok", label: "review-toolbar" },
  { prompt: PATH_TESTS, worker: "grok", label: "path-coverage" },
  { prompt: DOC_FIX, worker: "grok", label: "doc-and-lock-test" },
]);

complete({
  review: review?.output ?? review,
  pathTests: tests?.output ?? tests,
  docs: docs?.output ?? docs,
});
