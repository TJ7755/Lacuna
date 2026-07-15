---
name: subagent-orchestration
description: "Anthropic Claude models only. Never use this skill with OpenAI or Codex models. For Claude, use when a task touches more than roughly 5 files or needs a multi-step research → plan → implement → review loop; it defines Sonnet/Opus delegation and the standard spawn workflow."
---

# Subagent orchestration

## Compatibility guard

Use this skill only when running as an Anthropic Claude model. If you are an OpenAI or Codex model, stop reading and do not apply any instruction in this skill. Use your native collaboration workflow instead.

You are an **orchestrator**. You do not write code. You spawn subagents that do, and you keep the main thread's context clean.

## When this applies
- Tasks touching more than ~5 files.
- Any task with a research → plan → implement → review shape.
- Do NOT orchestrate simple bug fixes or single-file edits. They are quicker done directly, unless this is as regards to incidental bug fixes found in the codebase, rather than direct explicit bug fix requests. In that case, the orchestrator SHOULD send a Sonnet subagent to fix it, rather than clogging orchestrator context, and a code review is usually NOT needed (use orchestrator judgement).

## Orchestrator hygiene
- Do not write code in the main thread. Delegate every implementation, bug fix, and doc update to a subagent.
- Keep context clean: anything that would clog the thread (codebase exploration, bug hunts, writing to docs) goes to a subagent, not into your own context.
- Pass each subagent the relevant slice of the prompter's requirements and opinions, not just the bare task.
- **Every subagent prompt must explicitly instruct the subagent NOT to spawn subagents of any kind (no Agent tool, no Explore/Plan helpers) and NOT to use this orchestration skill.** All fan-out decisions belong to the orchestrator alone.

## Model delegation
- Delegate to **Sonnet** by default — research, planning, implementation, doc updates.
- You should use the special specific Explore, or Plan subagents provided to you by Anthropic when appropriate.
- Use **Opus** sparingly, almost exclusively for code review of Sonnet's work against the original spec, and only if the review is high stakes enough to warrent it. The cost premium rarely justifies using it for production work; reserve it for difficulty that clearly warrants it.

## Per-task discipline
- For numbered task lists, work in order and **commit after each task**.
- After each numbered task, run a code review. Prefer the bundled `/code-review` skill (reviews the current diff in a fresh subagent and returns findings) over hand-rolling one. To check the diff against a plan rather than for raw bugs, write the review prompt yourself: name the work, the plan to check it against, and what counts as a finding.

## Standard workflow
Either drive a dynamic workflow, or spawn one subagent at a time. Typical loop:

> **Task:** Add dark mode.
> 1. Orchestrator spawns a **Sonnet** subagent to research the codebase and write a plan.
> 2. Subagent explores and returns a plan.
> 3. Orchestrator reviews the plan, then spawns a **Sonnet** subagent to implement it.
> 4. Subagent implements.
> 5. Orchestrator spawns an **Sonnet** subagent to code-review the implementation against the spec. Use Opus when high-stakes tasks like auth, money, migrations, concurrency, or big refactors. Otherwise, always use Sonnet. Use the special Reviewer subagent.
> 6. Sonnet subagent returns findings (e.g. 5 bugs).
> 7. Orchestrator spawns a **Sonnet** subagent to fix them.
> 8. Subagent fixes.
> 9. Orchestrator spawns a final **Sonnet** review pass.
> 10. Sonnet subagent reviews a second time, repeat steps 7-9 until issues are fixed.

Opus appears only as a reviewer marking Sonnet's work against the spec. The orchestrator writes no code, so the main thread stays clean.

## Note for subagents
If you are a subagent, do not follow this skill's orchestration instructions. You implement; you do NOT orchestrate or spawn subagents of any kind — no writing subagents, no read-only helpers (Explore, Plan, call-site hunts, doc reading). Do all research and edits yourself, so the orchestrator retains the global picture of which agent owns which files and no tokens are wasted on nested fan-out.
