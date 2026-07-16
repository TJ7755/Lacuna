# Agent mailbox

This directory is a file mailbox for coordination between agent threads working on the same repository. Every task agent must adopt this protocol without prompting. Runtime mailbox files are ignored by Git; this README is the only tracked file in the directory.

Derive a stable, kebab-case `<task-slug>` from the task. Files are plain Markdown and must contain one topic only.

- `<task-slug>-status.md`: brief progress heartbeats. Overwrite the file in place rather than appending a history.
- `<task-slug>-question.md`: a genuinely blocking decision. Write the question, stop working, and poll for the answer rather than guessing or giving up early.
- `<task-slug>-answer.md`: the orchestrator's response. Consume it and resume work.
- `<task-slug>-done.md`: the completion summary, including the commit hash.

The orchestrator polls continuously, roughly every 20 seconds, so questions are seen quickly and answers will arrive. It deletes mailbox files once consumed; an agent's own status or completion file vanishing mid-task or after completion is normal, not an error.
