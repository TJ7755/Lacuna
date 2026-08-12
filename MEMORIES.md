# Lacuna MEMORIES.md

Durable facts about how to work in this repository, for every agent regardless of harness.

This file is not a changelog. `docs/CHANGES.md` records **what changed and why**, in chronological order, and grows forever. This file records **what is true now**, and is edited in place: when a fact stops being true, correct or delete the entry rather than appending a newer one below it. If something belongs in both, it goes in `docs/CHANGES.md` and is summarised here only if a future agent would get it wrong without being told.

Do not record what the codebase already states. Architecture, file layout, past fixes and commit history are discoverable by reading; the rules in `AGENTS.md` and `CLAUDE.md` are already injected. What belongs here is the non-obvious: things that have caught agents out before, constraints not visible from the code, and decisions whose reasoning would otherwise be lost.

Keep each entry to a heading and a few lines. State the fact, then why it matters.

---

## Delegation goes through Freebuff first

The preferred route for delegable work is a prompt written for the prompter to run in Freebuff, not a worker spawned directly. Freebuff is a TUI with no headless mode, so no agent can drive it — only the prompter can. Codex and DeepSeek are for when the prompter has explicitly asked for autonomy. Full rules in `CLAUDE.md`.

## Worktree agents start from master

Agents given their own Git worktree branch from `master` by default, so they begin on stale code whenever the real work is on a feature branch. Brief every worktree agent to reset to the correct feature branch before it starts, or it will silently reimplement against an old tree.

## Subagents must not spawn subagents

Only the orchestrator delegates. Every subagent brief must forbid nested spawning and forbid the subagent-orchestration skill. Nested fan-out multiplies spend invisibly and produces work nobody reviews.

## Review once, at the end

Batch code review to the end of a task list rather than reviewing after each individual task. Per-task review on a multi-task run burns budget re-reading the same files and fragments the reviewer's picture of the change.

This does not apply to Freebuff, which is deliberately told to spawn a reviewer on every commit — on free inference that cadence is what keeps the output honest.
