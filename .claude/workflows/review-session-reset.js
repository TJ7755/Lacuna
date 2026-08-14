export const meta = {
  name: "review-session-reset",
  description: "Review PR #76, the curricular practice session reset fix",
};

const BRANCH = "fix/practice-session-reset";

const REVIEW = `
Read AGENTS.md first: British English, no emojis, no subagents, report real command output.

# Read-only review

**Do not change a line of code, do not commit, do not push.** Your final message is the review.

The branch \\\`${BRANCH}\\\` is checked out in another worktree, so **do not switch to it**. Read it with
\\\`git diff master..${BRANCH}\\\`, \\\`git show ${BRANCH}:<path>\\\` and \\\`git show master:<path>\\\`.
Run checks by \\\`cd\\\`-ing into that worktree, not by moving your own tree — a previous reviewer
wasted three attempts running checks against master by mistake, so confirm with \\\`git rev-parse HEAD\\\`
that you are where you think you are before you trust any output.

# What this is

PR #76. Answering a card in a curricular practice session blanked the screen and zeroed the progress
bar, because a live-query-derived array changed identity after every Dexie write and retriggered the
session-load effect.

Two layers: freeze \\\`scopeLessonIds\\\` in \\\`CourseStudyFlow.tsx\\\`, and key the load effect in
\\\`useLearnSession.ts\\\` on serialised session identity rather than object identity.

# The questions that matter

1. **Does the reset still happen when it should?** This is the real risk, and it is the opposite of
   the bug. The effect *must* still reload on a genuine change: different course, different lesson,
   different practice node, changed tag filter, changed assessment or window, simple-mode toggle,
   mode change. A serialised key that collapses two genuinely different sessions into one string
   would leave a user studying the wrong queue — a worse bug than the one being fixed, and one no
   existing test would catch. Enumerate every field in the key and say what distinguishes it.

2. **Is \\\`undefined\\\` still distinct from \\\`[]\\\`?** The report claims a null-byte join keeps them
   apart. Verify. A course with no scope and a course with an empty scope are not the same session.

3. **Are the three dropped dependencies genuinely unread in the effect body?** \\\`finaliseSummary\\\`,
   \\\`persistPracticeMilestone\\\`, \\\`ratchetUnlocks\\\`. Removing a dependency that *is* read is how
   you get a stale closure — silent, and it would present months later as a session finishing with
   the wrong summary. Check the body yourself rather than trusting the claim. If one is read via a
   ref, confirm the ref is actually kept current.

4. **Layer 1's freeze.** Confirm the frozen array is genuinely re-copied when the step legitimately
   changes, and that the ref cannot serve a stale scope from a previous practice node.

5. **Do the two new tests actually test identity?** Both were reported as watched failing first.
   Confirm the assertions are about *reference identity*, not equality — an equality assertion would
   pass on the buggy code too. Re-run them against master yourself if you can do so without
   disturbing the other worktree.

6. **Was anything else in \\\`useLearnSession\\\` disturbed?** It is 1,700+ lines and the load effect
   is the heart of it. Confirm the diff does not change *when* a session loads in any other case.

7. Anything else wrong. You are not limited to this list.

# Verify

\\\`bun run typecheck:web\\\` and \\\`bun run test\\\` in the branch's worktree. Report real exit codes
and counts.

# Report

- **Verdict**: \\\`merge as is\\\`, \\\`merge after fixes\\\`, or \\\`do not merge\\\`, one sentence of why.
- **Findings**: file, line, what is wrong, certainty, ordered by severity. Defects separate from taste.
- **The key-collision question**: your independent answer to question 1, stated plainly. This is the
  one I most want an outside opinion on.
- **Verified clean**: what you checked and found sound.
- **Command output**: real exit codes and counts, and the \\\`git rev-parse HEAD\\\` proving where they ran.

If you find nothing wrong, say so. Do not manufacture findings.
`;

phase("Review");
const review = await agent(REVIEW, { worker: "grok", label: "review-session-reset" });

complete({ review: review?.output ?? review });
