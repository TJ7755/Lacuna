---
name: subagent-orchestration
description: "Use when a task touches more than roughly 5 files, or needs a multi-step research → plan → implement → review loop, or when the task is context-cluttering and is better delegated. Use your judgement. Defines orchestrator hygiene, model delegation, per-task commit and review discipline, and the standard spawn workflow. Do NOT use for single-file changes or simple bug fixes — those are faster handled directly without subagents."
---

# Subagent orchestration

You are an **orchestrator**. You do not write code. You spawn subagents that do, and you keep the main thread's context as clean as possible.

## When this applies
- Tasks touching more than ~5 files.
- Any task with a research → plan → implement → review shape.
- If a simple task is not related to the current work, e.g., a simple bug fix that the agent incidentally finds while working on something else.

## Orchestrator hygiene
- Do not write code in the main thread. Delegate every implementation, bug fix, and doc update to a subagent.
- Keep context clean: anything that would clog the thread (codebase exploration, bug hunts, writing to docs) goes to a subagent, not into your own context.
- Pass each subagent the relevant slice of the prompter's requirements and opinions, not just the bare task.
- **Every subagent prompt must explicitly instruct the subagent NOT to spawn subagents of any kind (EXCEPT explore subagents) and NOT to use this orchestration skill.** All fan-out decisions belong to the orchestrator alone.

## Model delegation
- Delegate to **Sonnet** by default — research, planning, implementation, doc updates.
- You should use the special specific Explore, or Plan subagents provided to you by Anthropic when appropriate.
- Use **Opus** sparingly, almost exclusively for code review of Sonnet's work against the original spec, and only if the review is high stakes enough to warrent it. The cost premium rarely justifies using it for production work; reserve it for difficulty that clearly warrants it.

## Per-task discipline
- For numbered task lists, work in order and **commit after each task**.

## Standard workflow
Either do it in parallel, or spawn one subagent at a time. Typical loop:

> **Task:** Add dark mode.
> 1. Orchestrator spawns a **Sonnet** subagent to research the codebase and write a plan.
> 2. Subagent explores and returns a plan.
> 3. Orchestrator reviews the plan, then spawns one or many **Sonnet** subagent(s) to implement it.
> 4. Subagent implements.
> 5. Orchestrator sends out next task to subagent(s)
> 6. Repeat 3-5 until the task is complete.
> 7. Orchestrator spawns a sonnet subagent to review the entire series of tasks at the end. Use Opus when high-stakes tasks like auth, money, migrations, concurrency, or big refactors. Otherwise, always use Sonnet. Use the special Reviewer subagent.
> 8. Orchestrator reviews the review, and either approves or sends back for fixes.
> 9. Orchestrator spawns a Sonnet subagent to fix bugs found.
> 10. Orchestrator sends out a Sonnet subagent to update docs, and file PRs.

An orchestrator can also open new worktrees for implementation in parallel if they dare to, and review and fix any merge conflicts themselves later.

## Note for subagents
If you are a subagent, do not follow this skill's orchestration instructions. You implement; you do NOT orchestrate writing subagents. Do all edits yourself, so the orchestrator retains the global picture of which agent owns which files and no tokens are wasted on nested fan-out.