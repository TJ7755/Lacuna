# Lacuna AGENTS.md

## Terminology
- **Agent** — you, the AI receiving these instructions.
- **Prompter** — the person giving you prompts.

## How to read this file
**Strict** instructions always apply. **Guidelines** apply by default but may be overridden by the agent where justified, or by an explicit prompt. If anything here is unclear, ask the prompter.

---

## Strict instructions

1. **British English** in all writing (comments, docs, user-facing text). Use American English only where a language's syntax forces it for code identifiers.
2. **No emojis**, anywhere. Express tone in words, unless explicitly allowed by the user. If there are existing emojis in the codebase, do NOT proactively remove them unless asked or confirmed by user.
3. **Before anything else** read the codebase *and* always ask the prompter about any ambiguities. Do not ask gratuitous questions.
4. **Before implementing, reporting bugs, or suggesting features**, search the codebase (and the web where applicable) to check whether the functionality already exists.
5. **Extend existing systems** rather than building parallel ones. **Follow existing conventions** — naming, file organisation, coding style. Do not introduce a different architectural pattern without strong reason.
6. **Do not implement unrequested features** or speculative improvements. Suggest them instead; implement only with explicit approval.
7. **Do not touch unrelated files.** Keep changes as small and local as possible.
8. **Inspect surrounding code before changing behaviour.** Do not assume APIs, types, or files exist without checking.
9. **No TODOs, placeholders, mock data, or stubs** unless explicitly requested.
10. **Do not remove comments** unless incorrect, obsolete, or superseded. Update outdated comments rather than deleting them.
11. **Fix incidental bugs** you find, even if it costs time. Mention each one, and commit it separately from the main task.
12. **Update documentation** (docs/SPEC.md, docs/CHANGES.md, README.md, etc.) after any meaningful change, and **MEMORIES.md** after any lesson learned. See Memories below. If the relevant documentation does not exist, ignore this.
13. **UI changes must look native** — beautiful, seamless, never bolted on. Follow the principles in `docs/frontend-design.md`. (Claude Code agents have these as the frontend-design skill; other harnesses must read the document.) Keep user-facing text minimal and intentional; no cringe or design-commentary copy.
14. **Avoid unnecessary dependencies.** Keep dependencies up to date where possible, and avoid known security concerns.

---

## Guidelines

1. **Be surgical.** Prefer the least code that achieves the functionality with the least future maintenance. Reducing code beats adding it. Fix incidental performance issues you find.
2. **When multiple reasonable solutions exist**, explain the trade-offs and ask the prompter which they prefer — unless one is clearly superior, in which case say so and proceed.
3. **Prioritise performance over aesthetics**, and make the trade-off explicit. If the performance difference is negligible, prefer aesthetics.
4. **Complete the entire task list in one go** (where a list exists), except for asking questions. Do not stop after the first task unless blocked by ambiguity or errors.
5. **Extract rather than append.** When a change would push a file past ~500 lines, or adds a concern distinct from the file's main responsibility (e.g. gesture handling inside a page component), extract it into a new module instead of appending. Extending existing *systems* does not mean extending existing *files*.

---

## Agent mailbox

Every non-Claude worker uses the mailbox by default — Codex, DeepSeek, Freebuff, or anything else driven outside Claude Code. Claude subagents use it only when the orchestrator explicitly approves.

Derive a stable kebab-case slug from the task, write `<slug>-status.md` heartbeats, and finish with `<slug>-done.md` containing a summary and commit hash. When blocked, write `<slug>-question.md`, stop work, and poll for `<slug>-answer.md` rather than guessing or giving up early.

The orchestrator polls the mailbox roughly every 20 seconds, so questions will be seen and answered quickly. It deletes consumed files; a status or completion file vanishing is normal. Runtime mailbox files are temporary, ignored by Git, and must not be committed. See `.agent-mail/README.md` for the full protocol, including the `-inbox.md` and `-spawn-next.md` message kinds and the blocking `await-mail` helper.

---

## Memories

`MEMORIES.md` holds durable facts about how to work in this repository. Read it before starting; it is short by design, and it exists because it carries the things that have caught agents out before.

Write to it when you learn something a future agent would otherwise get wrong. It is not a changelog: `docs/CHANGES.md` records what changed and why, in order, and grows forever; `MEMORIES.md` records what is true now, and is edited in place. When a fact stops being true, correct or delete that entry rather than appending a newer one beneath it.

Do not record what is already discoverable — architecture, file layout, past fixes, commit history, or the rules in this file. Keep each entry to a heading and a few lines: the fact, then why it matters.

---

## Project Context
Lacuna is a prototype alpha project. Suggest sweeping changes that affect the codebase optimised for long-term stability and performance as well as features.

Mixed-model workflows: follow `.claude/skills/lmo/SKILL.md`. Start with `npx lmorchestrator` so the monitor opens.
