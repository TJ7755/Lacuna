export const meta = {
  name: "session-reset-fix",
  description: "Stop curricular practice sessions reloading and zeroing progress after every answer",
};

const BRANCH = "fix/practice-session-reset";

const FIX = `
Read AGENTS.md first and follow the house rules in full: British English, no emojis, no subagents,
no TODOs or placeholders, no unrequested features, report real command output.

Branch \`${BRANCH}\` from master. Commit in small granular steps. Do not push, do not open a PR.

# The bug, already diagnosed and proved

Answering a card in a **curricular practice** session blanks the screen and resets the progress bar
to zero. Ordinary lesson study, ad-hoc due review and standalone \`/course/:id/learn\` are unaffected.

The chain, established by experiment — you do not need to re-derive it, but do verify it still holds
before changing anything:

1. Answering writes the review (and, for a named practice node, the milestone) to Dexie.
2. \`useCourseStudyFlow\` is a live query over \`cards\` and \`practiceMilestones\`, so it emits a
   **new \`practiceByKey\` Map** after that write.
3. \`CourseStudyFlow.tsx\` (around lines 142-158) lists that Map as a \`useMemo\` dependency and
   always spreads a **fresh \`scopeLessonIds\` array**.
4. That array arrives in \`useLearnSession\` as \`requestScopeLessonIds\`, which is a dependency of
   the session-load effect (deps list around lines 1216-1235).
5. The effect refires. Its first act (around lines 841-892) is \`setPhase('loading')\`,
   \`setSchedulerProgress(0)\`, \`setSessionCardIds([])\`.

That explains every symptom: the bar moves because the review really was committed; the blank is a
real unmount, and shows as blank rather than a skeleton because \`DelayedFallback\` renders \`null\`
for its first 250 ms; the next card appears because the queue is re-derived from Dexie; progress is
zero because it is session-local state that was just reset.

# The fix, in two layers

Both are wanted. The first stops this trigger; the second stops the class.

**Layer 1 — \`src/pages/CourseStudyFlow.tsx\`, roughly 20 lines, low risk.**

Freeze \`scopeLessonIds\` when the step is committed, exactly the way \`currentStep\` already freezes
\`displayStep\`. An in-flight Learn request must not depend on \`flow?.snapshot.practiceByKey\`. If
the committed step is curricular, copy the ids once into \`currentStep\` (or a ref) and reuse that
same array afterwards.

Note there is already a comment near \`CourseStudyFlow.tsx:119\` about this class of problem, and an
existing test \`does not rebuild the Learn request after committing a render-derived practice node\`.
**Extend that test**: after a snapshot identity change carrying the *same* ids, the recorded Learn
requests must still hold **one reference**. Identity is the property under test, not equality.

**Layer 2 — \`src/pages/learn/useLearnSession.ts\`, roughly 30 lines, low to medium risk.**

Make the load effect key on **session identity**, not object identity. Serialise
\`requestScopeLessonIds\` and \`filterParams\` into a stable key (a join is fine) and depend on that.

Drop \`finaliseSummary\`, \`persistPracticeMilestone\` and \`ratchetUnlocks\` from the dependency
list — they are not identity, and \`serveNextRef\` is the existing precedent in this file for that
treatment. \`persistPracticeMilestone\` is not even read in the effect body; confirm that before
removing it.

**Keep** \`courseId\`, \`lessonId\`, \`practiceNodeKeyParam\`, \`tagFilter\`, the assessment and
window ids, \`isSimpleMode\` and \`mode\`.

**The risk to guard against:** a serialised key that misses a real navigation. Same lesson ids but a
different practice node must still reload, which is why \`practiceNodeKeyParam\` has to be in the
key. Write a test for exactly that case.

Do **not** stop resetting when the user genuinely changes course, node or filters. The reset is
correct behaviour; only the spurious trigger is the bug.

# Explicitly out of scope

Note these in your report; do not fix them.

- \`DelayedFallback\`. Once the effect stops retriggering, the flash goes. Leave it alone.
- \`eligiblePracticePool\`.
- \`answer\` listing \`sessionCardOutcomes\` as a dependency, so the callback is new after every
  grade. Sloppy, unrelated.
- The load effect's comment claiming it reads "a static snapshot so the session is stable", which is
  no longer true. **You may correct that comment**, since house rule 10 says to update outdated
  comments rather than leave them misleading.

# A warning from the diagnosis

\`filterParams\` is the same landmine as \`scopeLessonIds\`. A parent passing an inline \`[]\` would
reload forever. The previous worker hit this by accident in a scratch test and exhausted memory. If
you write a scratch harness, memoise what you pass in.

# Prove the fix

A passing suite is not enough here — the old suite passed while this bug shipped.

**Demonstrate the failure first.** Write the test, watch it fail against current \`master\`
behaviour, then apply the fix and watch it pass. Report what the failure output actually said. A
regression test never observed failing is not a regression test.

Cover at least: answering in a curricular practice session does not reset progress or return the
session to \`loading\`; and changing practice node still does reload.

# Checks

\`bun run typecheck:web\` and \`bun run test\`. Both must pass, with real output and real counts.

# Report

Your final message is the return value. Give the commits, what you changed in each layer, the
failing-then-passing output for the new tests, anything in the diagnosis that did not hold when you
checked it, and anything you deliberately left alone.
`;

phase("Fix");
const fix = await agent(FIX, { worker: "grok", label: "session-reset" });

complete({ branch: BRANCH, fix: fix?.output ?? fix });
