---
name: lmo
description: >
  Run mixed-model dynamic workflows with LMO. Use when fanning work out across
  Sol, Luna, DeepSeek or Grok, writing a workflow script, or when the user
  asks for a workflow or Claude-style orchestration.
---

# LMO

Orchestrate workers with a JavaScript script. The runtime holds the plan. You do not drive each agent turn by turn.

## Open the monitor first

Before writing or launching a workflow, start the UI:

```sh
npx lmorchestrator
```

Same command as `lmo` if that binary is on your PATH, or `bunx lmorchestrator`. If the server is already up, the command opens the tab and exits. If it is not, the process stays in the foreground — start it in the background and carry on. Do not wait for it.

First run in a repo edits two tracked files — it appends `.lmo/` to `.gitignore` and a skill pointer to `AGENTS.md` — and writes `.claude/skills/lmo/SKILL.md` and `.lmo/config.json`, which are untracked. It prints exactly what it wrote, so a dirty tree afterwards is accounted for.

Each repo gets its own server, on a port derived from its path, and it prints that port and root when it starts. A run always executes against the repo you launched it from; if something else is already on this repo's port, the command refuses rather than borrowing it. Check the `root:` line the CLI prints matches the repo you meant.

## Launch a run

Write a script (inline or under `.claude/workflows/<name>.js`), then:

```sh
npx lmorchestrator workflow --script-path <file.js>
```

Or `--name <saved-name>`. It returns at once with a run id. Watch the stave; do not sit in the CLI.

Pass `--session <id> --harness claude|codex|grok` when you know this session's id, so LMO can ping you when the run asks a question or finishes.

Answer a parked question:

```sh
npx lmorchestrator reply <runId> --answer <text>
```

## Script

```js
export const meta = {
  name: "audit-routes",
  description: "Audit route handlers for missing auth",
}

phase("Find")
const found = await agent("List every route file under src/routes.", {
  worker: "sol",
  schema: {
    type: "object",
    required: ["files"],
    properties: { files: { type: "array", items: { type: "string" } } },
  },
})

phase("Audit")
const audits = await pipeline(found.output.files, (file) =>
  agent(`Audit ${file} for missing authentication checks.`, {
    worker: "luna",
    label: file,
  }),
)

complete(audits.filter((row) => row && row.success))
```

`meta` is read on its own, before the script runs, so it must be a static object literal — no variables, no function calls, no template interpolation. The trailing semicolon is optional.

Host: `agent(prompt, { worker, label?, schema? })`, `pipeline(list, fn)`, `parallel([{ prompt, worker, … }])`, `phase(title)`, `apply(result)`, `ask(message, { options? })`, `complete(value)`, `args`.

## Worktrees, and how a later agent sees earlier work

Every `agent()` runs in its own git worktree cut from `HEAD`. That is what lets agents work in parallel without fighting over the same files, and it has one consequence worth planning around:

**`apply(result)` copies files into the parent tree, not into the next agent's worktree.** A reviewer agent placed after `apply()` still gets a worktree from `HEAD`, so it sees none of the changes and will happily review nothing. This fails quietly — the review comes back clean.

To hand work from one agent to the next, go through git, since worktrees share the object database:

```js
const built = await agent("Extract note CRUD into src/db/notes.ts. Commit to branch wip/notes.", { worker: "grok" })
const review = await agent("Review `git diff main..wip/notes`. Report problems only.", { worker: "grok" })
apply(built)
```

Use `apply()` for the final result you want in the working tree; use a branch when a later agent must read an earlier one's output.

**A worktree is not a sandbox.** It is where the agent starts and what `apply()` reads. Workers have shell access, so nothing stops one writing outside it — a worker that decides its brief points elsewhere can and will `cd` somewhere else, commit to another branch, or edit the parent tree directly. Treat the worktree as a working-directory default that keeps parallel agents off each other's files, never as a containment or blast-radius boundary. Review what a worker did, not just what it returned.

`ask()` parks the run and pings you.

## Workers

Closed set. Do not pick slugs or effort levels.

| Name | Model | Effort |
|------|-------|--------|
| `sol` | GPT 5.6 Sol | medium |
| `luna` | GPT 5.6 Luna | max |
| `deepseek` | DeepSeek V4 Flash | max |
| `grok` | Grok 4.6 | high |

Sol and Luna share one Codex queue (two live). DeepSeek is for bite-sized mechanical work. Do not give Luna or DeepSeek open-ended design.

A worker that needs you returns `{ kind: "question", question, options? }`. You answer with `npx lmorchestrator reply`.
