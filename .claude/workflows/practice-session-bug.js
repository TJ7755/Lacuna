export const meta = {
  name: "practice-session-bug",
  description: "Diagnose why practice sessions reset progress and blank the screen between cards",
};

const DIAGNOSE = `
Read AGENTS.md first and follow the house rules: British English, no emojis, no subagents, report
real evidence rather than describing it.

# This is a diagnosis, not a fix

**Do not change a single line of production code. Do not commit. Do not create a branch.**
Your entire output is a diagnosis. If you are certain of the fix, describe it precisely — but do
not apply it. The orchestrator decides what gets changed and briefs it separately.

You may add temporary instrumentation or a scratch test to prove a hypothesis, as long as you
revert it and say you did. Reverting is not optional.

# The symptom, reported by the user just now

Studying a course session ("French beginner to advanced"). After answering a card:

1. The progress bar moves forward.
2. The screen then appears to refresh and **everything is temporarily gone** — a blank flash.
3. The next card appears.
4. **The progress bar is back at 0.**

He had done "quite a few cards" before noticing. He also said "the practice sessions don't work",
so treat practice/manual-practice sessions as the likeliest place this bites hardest, but confirm
whether it also affects ordinary course study.

One thing you can rule out: his screenshot shows a sequence headed "ENGLISH MONARCHS" inside the
French course. That is **his own test data**, deliberately placed, and confirmed not a bug. Do not
spend any effort on cross-course queue composition.

# Where to look

The session lives in \`src/pages/learn/useLearnSession.ts\` — around 1,781 lines, with the
session-load effect at roughly lines 840-1235. That effect is the prime suspect: a blank flash plus
a progress reset is the signature of the session **reloading and re-deriving its state from
scratch** mid-session, rather than advancing.

Questions worth answering:

- What are the dependencies of the session-load effect, and can any of them change identity on
  every answer? An object or array rebuilt each render, a \`useLiveQuery\` result that returns a new
  reference after a write, or a date/\`now\` value would all do it.
- Answering a card writes to Dexie. Does that write invalidate a live query that the load effect
  depends on, making the write itself retrigger the load? That would be a feedback loop and would
  explain all four symptoms at once.
- Where does the progress number come from, and is it derived from session state that the reload
  resets, or from something durable? Progress returning to 0 while the card advances suggests the
  card queue survives and the counter does not.
- Is the blank flash a genuine unmount, a loading state, or a suspense boundary?

Those are hypotheses, not conclusions. Test them; discard the ones that are wrong and say so.

# Prove it

A diagnosis backed by evidence is worth ten that sound plausible. Preferably:

- Write a failing test that reproduces the reset, or
- Add temporary logging, run the app, and quote the real output showing the effect firing twice.

Say explicitly which parts you **proved** and which parts remain informed guesses. Do not present a
hypothesis as a finding. If you cannot reproduce it, say that plainly rather than inventing a
cause — that is a useful result too, and tells us it is environment- or data-specific.

You may run \`bun run dev\` and drive the app if that helps. \`bun run test\` and
\`bun run typecheck:web\` are available.

# Report

Your final message is the return value. Give:

- **Root cause**, in one paragraph, and how confident you are.
- **Evidence**: the test, the log output, or the code path, quoted.
- **Is it one bug or several?** Say whether the blank flash, the progress reset and the practice
  sessions failing are one fault or distinct ones. They may not be.
- **The fix you would make**, described precisely enough to brief someone else, including which
  files and roughly how large a change it is. Say if it is risky.
- **Anything else you noticed** in that file that is wrong but out of scope. Do not fix it.
`;

phase("Diagnose");
const diagnosis = await agent(DIAGNOSE, { worker: "grok", label: "diagnose-session-reset" });

complete({ diagnosis: diagnosis?.output ?? diagnosis });
