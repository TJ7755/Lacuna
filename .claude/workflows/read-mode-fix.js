export const meta = {
  name: "read-mode-fix",
  description: "Gate the leaking Path authoring controls behind the existing authoring flag",
};

const BRANCH = "fix/read-mode-authoring-gate";

const FIX = `
Read AGENTS.md first and follow the house rules in full: British English, no emojis, no subagents,
no TODOs or placeholders, no unrequested features, report real command output.

# Task

An audit found seven places where course **Read** mode still shows controls that perform real
writes. Close them, using the flag that already exists. Do not invent a new mechanism.

Work on a branch named exactly \`${BRANCH}\`, created from master. Commit in small granular steps.
Do not push and do not open a pull request.

# The decision already taken — do not reopen it

Read mode is a **presentation and focus mode**, not a write barrier. The Settings copy is the
contract: "How lessons in this course open by default."

So: **gate the controls, do not guard the repository.** Do not wrap repository functions, do not
gate routes, do not touch the Question Bank, Settings, Analytics or the command palette. Those are
deliberately out of scope. If you find yourself adding a check inside \`src/db/\`, stop — you have
misread the task.

# The mechanism that already exists

\`Course.lessonViewMode\` (\`'study' | 'edit'\`), resolved by \`resolveLessonViewMode\` in
\`src/course/lessonViewMode.ts\`. \`isLessonAuthoringMode\` is
\`resolveLessonViewMode(course) === 'edit'\`. \`CoursePath\` already computes this as \`authoring\`
and passes it to some children.

Note \`resolveLessonViewMode\` forces \`'study'\` when \`canEditLessons(course)\` is false, so gating
on \`authoring\` **also** closes the shared-course lock hole for free. That is why \`authoring\` is
the right condition and \`canEditLessons\` is not.

# The seven leaks

Each is visible and performs a real write in Read mode.

1. \`src/pages/CoursePath.tsx\` 519, 571-573 — start/end \`InsertGap\` ("Manual practice"). Opens
   the practice editor; Save calls \`createPracticeNode\`.
2. \`src/components/course/CoursePathSegment.tsx\` 160-162, 169-181 — mid-path \`InsertButton\`
   (\`aria-label="Add manual practice here"\`). \`authoring\` is already a prop on
   \`PathNodeWithLine\` and is simply not consulted.
3. \`src/components/course/PathNodeView.tsx\` 96-100 and \`PracticeNode.tsx\` 90-102 — the pencil on
   a manual practice node. \`onEdit\` is passed for every \`practice-manual\` node. Stop passing
   \`onPracticeEdit\` unless \`authoring\`.
4. \`src/pages/CoursePath.tsx\` 511-515, 575-579 — "Add lesson" on empty and populated paths.
   \`AddLessonControl.save\` calls \`createLesson\`.
5. \`src/pages/LessonView.tsx\` 157-163 — "Add lesson" on a one-lesson course's inline path.
6. \`src/pages/CoursePath.tsx\` 430-443 — course title pencil and double-click rename. Currently
   gated on \`canEditLessons\`, which is the wrong gate. \`APP-FLOWS.md\` 205 says Edit only.
7. \`src/pages/LessonView.tsx\` 188-201 — lesson title pencil and double-click rename. Same wrong
   gate. \`APP-FLOWS.md\` 293 says Edit only.

**Verify each one yourself before changing it.** Line numbers may have drifted and the audit was
read-only. If a claim does not hold, say so in your report and leave that one alone.

# Two tests currently assert the bug

\`src/pages/LessonView.test.tsx\` around 213-221 and 224-235 run in default study mode and expect
\`createLesson\` and \`updateLesson('lesson-1', { name: 'Renamed lesson' })\` to happen. They encode
the leak.

**Update them to assert the fixed behaviour** — the control is absent in Read mode — and add
matching cases proving it still works in Edit mode. Do not simply delete them. A gate with no test
for both sides of it is how this came back.

# Prefer absent to disabled

Hide these controls in Read mode rather than rendering them disabled. They are authoring chrome;
a disabled pencil is clutter that says nothing useful. This also matches how the Path already
handles inactive manual practice nodes and locked lessons.

# Checks

\`bun run typecheck:web\` and \`bun run test\`. Both must pass. Report real output and counts.

Pay attention to \`CoursePath\`, \`LessonView\`, \`LessonNode\` and \`CoursePathSegment\` test files.

# Report

Your final message is the return value. Give: the commits, which of the seven you verified and
fixed, any whose claim did not hold, what you changed in the two tests, the real check output, and
anything you noticed that is wrong but out of scope. Do not fix out-of-scope things.
`;

phase("Fix");
const fix = await agent(FIX, { worker: "grok", label: "read-mode-gate" });

complete({ branch: BRANCH, fix: fix?.output ?? fix });
