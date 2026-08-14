export const meta = {
  name: "review-read-mode-gate",
  description: "Review PR #75, the Read-mode authoring gate",
};

const BRANCH = "fix/read-mode-authoring-gate";

const REVIEW = `
Read AGENTS.md first: British English, no emojis, no subagents, report real command output.

# Read-only review

**Do not change a line of code, do not commit, do not push.** Your final message is the review.
Another worker is active on a different branch; stay read-only and you cannot collide.

The branch \`${BRANCH}\` is checked out in another worktree, so **do not switch to it**. Read it with
\`git diff master..${BRANCH}\`, \`git show ${BRANCH}:<path>\` and \`git show master:<path>\`.

# What this is

PR #75. Course **Read** mode was showing seven controls that performed real writes. This gates them
behind the existing \`authoring\` flag (\`isLessonAuthoringMode\` /
\`resolveLessonViewMode(course) === 'edit'\`).

The decision taken, which you should not relitigate: Read is a **presentation and focus mode**, not
a write barrier. Gate the controls, do not guard the repository. Judge the change against that
decision, not against a stricter one.

# The questions that matter

1. **Are all seven genuinely closed?** The gaps and mid-path insert, the practice pencil, Add lesson
   on the Path, inline Add lesson in \`LessonView\`, course rename, lesson rename. For each, trace
   from the rendered control to the repository call and confirm the path cannot be reached in Read
   mode. Do not accept "the component is not rendered" without checking the handler is also gone.

2. **Did anything get gated that should not have been?** This is the failure mode nobody looks for.
   Edit mode must still do all seven. A gate applied one level too high — hiding a whole section
   rather than its authoring chrome — would be a regression that the tests might not catch. Check
   Edit mode as carefully as Read mode.

3. **Is \`authoring\` the right condition everywhere it was applied?** Two of the seven previously
   used \`canEditLessons\`, the shared-course lock. Confirm the change from \`canEditLessons\` to
   \`authoring\` does not *weaken* the lock for a distributed copy. The claim is that it cannot,
   because \`resolveLessonViewMode\` already forces \`'study'\` when \`canEditLessons\` is false —
   verify that in the code rather than taking it on trust. If that helper can ever return \`'edit'\`
   for a locked course, this PR opens a hole.

4. **The two converted tests.** They previously asserted the bug: clicking Add lesson and rename in
   default study mode and expecting writes. Confirm they now assert absence *and* that the paired
   Edit-mode cases genuinely exercise the write, rather than being weakened into something that
   would pass either way.

5. **Is anything still leaking that the audit missed?** The audit swept the Path and lesson view.
   Sweep again with fresh eyes, by verb (create/add/new/edit/rename/delete/remove/reorder) and by
   handler (anything calling a repository write). Out of scope by decision: Course Settings, the
   Question Bank, Analytics, the command palette. Say if you find something in scope that was
   missed.

6. **Absent versus disabled.** The brief asked for absent. Confirm that is what happened and that no
   control was left rendered-but-inert.

7. Anything else wrong. You are not limited to this list.

# Verify

\`bun run typecheck:web\` and \`bun run test\`, in the branch's worktree. Report real exit codes and
counts. Say which tests would still pass if the gate were removed entirely — if the answer is
"most of them", that is the most important sentence in your review.

# Report

- **Verdict**: \`merge as is\`, \`merge after fixes\`, or \`do not merge\`, one sentence of why.
- **Findings**: file, line, what is wrong, certainty, ordered by severity. Separate defects from taste.
- **The lock question**: your independent answer to question 3, stated plainly.
- **Verified clean**: what you checked and found sound, Edit mode included.
- **Command output**: real exit codes and counts.

If you find nothing wrong, say so. Do not manufacture findings to look thorough.
`;

phase("Review");
const review = await agent(REVIEW, { worker: "grok", label: "review-read-mode" });

complete({ review: review?.output ?? review });
