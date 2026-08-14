export const meta = {
  name: "note-repository",
  description: "Extract note CRUD from repository.ts into noteRepository.ts, then review it",
};

const BRANCH = "refactor/note-repository"

const HOUSE_RULES = `
Read AGENTS.md first and follow the house rules in full: British English, no emojis, no subagents,
no TODOs or placeholders or stubs, no unrequested features, report real command output rather than
describing it.
`

const EXTRACT = `${HOUSE_RULES}

# Task: extract the note repository

Move the note section of \`src/db/repository.ts\` into a new \`src/db/noteRepository.ts\`:
\`createNote\`, \`updateNote\`, \`deleteNote\`, \`listNotes\`, \`reorderNotes\`, and the
note-annotation CRUD (\`createNoteAnnotation\`, \`updateNoteAnnotation\`, \`deleteNoteAnnotation\`,
\`listNoteAnnotations\`). They currently sit at roughly lines 2152-2262; verify the real boundaries
yourself rather than trusting those numbers.

**Copy the pattern of the three modules already extracted**: \`sequenceRepository.ts\`,
\`practiceNodeRepository.ts\` and \`occlusionRepository.ts\`. \`sequenceRepository.ts\` is the most
recent and the closest model — follow it.

## Rules that make this safe

- **Re-export every moved name from \`repository.ts\`** so no existing import changes.
- **Re-export only what was already exported.** Helpers that were private \`function\` declarations
  must stay private in the new module. Re-exporting them would expand the public API and break the
  claim that this is a pure move. This is a real mistake a previous brief made; do not repeat it.
- **Do not retarget a single caller.** That is a separate, greppable change for later.
- **Do not change behaviour.** This is a move, not a refactor. If you are tempted to improve
  something you are moving, note it in your report and move it unchanged.
- Shared helpers stay where they are and are imported, never duplicated — \`friendlyDbError\` from
  \`./dbErrors\`, and \`stampUpdatedAt\` / \`recordTombstone\` / \`recordTombstones\` /
  \`clearTombstone\` / \`clearTombstones\` / \`lessonCardExposureId\` from \`./mutationStamp\`.
- **Never import anything from \`repository.ts\`.** It imports the extracted modules for its
  re-exports, so that direction closes a genuine cycle. If you need a shared helper that currently
  lives in \`repository.ts\`, stop and say so rather than creating the cycle.
- Note annotations are device-local: they are absent from \`BackupFile\` and are deliberately **not**
  tombstoned, though they do carry \`updatedAt\`. Preserve that exactly.

## Territory

You own \`src/db/repository.ts\`, the new \`src/db/noteRepository.ts\`, and \`docs/CHANGES.md\`
for a final entry. Touch nothing else.

## Deliverable

Work on a branch named exactly \`${BRANCH}\`, created from master. Commit in small granular steps.

Run \`bun run typecheck:web\` and \`bun run test\`. Both must pass and you must report the real
output and real counts. Confirm the existing note test files still pass **through the re-export**,
without their imports being changed.

Do not push and do not open a pull request.

Your final message is the return value. Report: the commit hashes, the branch name, the real check
output, anything you deliberately left unchanged, and anything you think is wrong with this brief.
`

const REVIEW = `${HOUSE_RULES}

# Task: review the note repository extraction

**This is a read-only review. Do not change a single line of code, do not commit, do not push.**
Your final message is the review itself.

Another worker has committed an extraction on branch \`${BRANCH}\`. It moved the note and
note-annotation CRUD out of \`src/db/repository.ts\` into a new \`src/db/noteRepository.ts\`.

That branch is checked out in another worktree, so **do not switch to it**. Read it with
\`git diff master..${BRANCH}\` and \`git show ${BRANCH}:<path>\` and \`git show master:<path>\`,
which all work without moving your own tree.

The author's claim, which is what you are testing, is that **this is a pure move, not a refactor**:
every previously-public name is re-exported from \`repository.ts\`, no caller import changed, and
no behaviour changed in transit.

## The questions that matter

1. **Is it genuinely a move?** Extract the original span from \`git show master:src/db/repository.ts\`
   and compare it to the new module. Any renamed variable, reordered statement, changed error
   message, altered default or in-transit "improvement" is a finding, however harmless. Quote the
   before and after.

2. **Are the re-exports exactly right — neither missing nor over-broad?** Every name that was
   \`export\`ed from \`repository.ts\` on master must still be importable from \`./repository\`.
   Equally, a helper that was private on master must **not** have become public. Check type exports
   as carefully as value exports: the project sets \`isolatedModules\`, so an interface must be
   re-exported with \`export type\`.

3. **Did any caller import actually change?** The claim is none did. Verify by grep, not by trusting
   the report. Confirm the note test files still import from \`./repository\`.

4. **Stamps and tombstones.** Moved writes must still stamp \`updatedAt\`, and moved deletes must
   still write tombstones inside the caller's Dexie transaction. Confirm the shared helpers were
   imported and not copied — a fourth copy of a tombstone key is exactly the fault a previous
   extraction created.

5. **Note annotations must still not be tombstoned.** They are device-local and absent from
   \`BackupFile\`, but they do carry \`updatedAt\`. If the move quietly started tombstoning them, or
   stopped stamping them, that is the most important finding in your report and belongs at the top.

6. **No cycle.** \`noteRepository.ts\` must not import from \`repository.ts\`. Confirm the import
   direction and that nothing it does import reaches back.

7. Anything else wrong. You are not limited to this list.

## Verify

Run \`bun run typecheck:web\` and \`bun run test\` and report the real exit codes and counts.

## Report format

- **Verdict**: \`merge as is\`, \`merge after fixes\`, or \`do not merge\`, and one sentence of why.
- **Findings**: file, line, what is wrong, how certain you are, ordered by severity. Separate real
  defects from matters of taste and say which is which.
- **Verified clean**: the specific claims you checked and found true. This matters as much as the
  findings — it says what has actually been established.
- **Command output**: real exit codes and counts.

If you find nothing wrong, say so plainly. Do not manufacture findings to look thorough.
`

phase("Extract")
const extraction = await agent(EXTRACT, { worker: "grok", label: "extract-notes" })

if (!extraction || extraction.success === false) {
  complete({ ok: false, stage: "extract", extraction })
};

phase("Review")
const review = await agent(REVIEW, { worker: "grok", label: "review-notes" })

complete({
  ok: true,
  branch: BRANCH,
  extraction: extraction.output ?? extraction,
  review: review?.output ?? review,
})
