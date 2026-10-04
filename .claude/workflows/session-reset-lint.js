export const meta = {
  name: "session-reset-lint",
  description: "Fix the exhaustive-deps lint error on the practice session reset branch",
};

const FIX = `
Read AGENTS.md first: British English, no emojis, no subagents, report real command output.

# Task

Branch \\\`fix/practice-session-reset\\\` (PR #76) fixes a real bug but fails CI lint. Fix that, and
nothing else.

Check out the existing branch — do **not** branch from master, and do not rebase or squash. Add one
commit on top. Do not push and do not open a pull request.

# The error

\\\`react-hooks/exhaustive-deps\\\` is \\\`'error'\\\` in \\\`.eslintrc.cjs\\\`, and \\\`bun run lint\\\`
is a required CI job.

    error  React Hook useEffect has missing dependencies: 'filterParams' and 'requestScopeLessonIds'

The load effect in \\\`src/pages/learn/useLearnSession.ts\\\` still *reads* those two arrays in its
body, but the dependency list now names only the serialised keys
(\\\`filterParamsKey\\\`, \\\`requestScopeLessonIdsKey\\\`). That is deliberate and correct — depending
on the arrays is what caused the bug.

# What to do

Add a targeted \\\`eslint-disable-next-line react-hooks/exhaustive-deps\\\` on the dependency array,
with a short comment stating why: the effect depends on session *identity*, not object identity, so
the serialised keys are the triggers; the arrays are read for their values only, and their content
changing always changes the key, so the closure cannot go stale.

**Do not** put the arrays back into the dependency list. That reintroduces the bug the branch exists
to fix.

**Do not** silence the rule file-wide or repo-wide. One line, at that one effect.

**Do not** restructure into refs. That was the alternative and it is more machinery than this needs:
because the key changes whenever the content changes, the effect always re-runs with fresh values,
so there is no staleness for a ref to solve.

Leave the three pre-existing warnings in other files alone. They are not yours.

# Checks

Run all three and report real output and exit codes:

- \\\`bun run lint\\\` — must be exit 0 with no errors.
- \\\`bun run typecheck:web\\\`
- \\\`bun run test\\\`

Confirm with \\\`git rev-parse HEAD\\\` and \\\`git branch --show-current\\\` that you are on
\\\`fix/practice-session-reset\\\` before trusting any output.

# Report

Your final message is the return value. Give the commit hash, the exact lint output before and
after, and confirmation the test count is unchanged.
`;

phase("Lint");
const fix = await agent(FIX, { worker: "grok", label: "session-reset-lint" });

complete({ fix: fix?.output ?? fix });
