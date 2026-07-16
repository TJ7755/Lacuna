# Agent mailbox

This directory is a file mailbox for coordination between agent threads working on the same repository. Runtime mailbox files are ignored by Git; this README is the only tracked file in the directory.

Use a stable, kebab-case `<task-slug>` for each task. Files are plain Markdown and must contain one topic only.

- `<task-slug>-status.md`: brief progress heartbeats. Overwrite the file in place rather than appending a history.
- `<task-slug>-question.md`: a decision needed before work can continue. Write the question, stop working, and wait for the orchestrator.
- `<task-slug>-answer.md`: the orchestrator's response to a blocked agent. A blocked agent must poll for this file before giving up, then consume the answer and resume work.
- `<task-slug>-done.md`: the completion summary, including the commit hash.

The orchestrator deletes mailbox files once they have been consumed.
