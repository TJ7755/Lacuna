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
12. **Update documentation** (docs/SPEC.md, README.md, etc.) after any meaningful change, adding a changelog fragment in `docs/changes/unreleased/` (see its README) rather than editing docs/CHANGES.md, and **MEMORIES.md** after any lesson learned. See Memories below. If the relevant documentation does not exist, ignore this.
13. **UI changes must look native** — beautiful, seamless, never bolted on. Follow `docs/spec/visual-design.md` and `docs/spec/accessibility.md`, which define the palette, typography, motion and layout the code implements. Keep user-facing text minimal and intentional; no cringe or design-commentary copy.
14. **Avoid unnecessary dependencies.** Keep dependencies up to date where possible, and avoid known security concerns.

---

## Guidelines

1. **Be surgical.** Prefer the least code that achieves the functionality with the least future maintenance. Reducing code beats adding it. Fix incidental performance issues you find.
2. **When multiple reasonable solutions exist**, explain the trade-offs and ask the prompter which they prefer — unless one is clearly superior, in which case say so and proceed.
3. **Prioritise performance over aesthetics**, and make the trade-off explicit. If the performance difference is negligible, prioritise aesthetics.
4. **Complete the entire task list in one go** (where a list exists), except for asking questions. Do not stop after the first task unless blocked by ambiguity or errors.
5. **Extract rather than append.** When a change would push a file past ~500 lines, or adds a concern distinct from the file's main responsibility (e.g. gesture handling inside a page component), extract it into a new module instead of appending. Extending existing *systems* does not mean extending existing *files*.
6. **Prove behaviour changes with a red-to-green test.** Every bug fix or intentional behaviour change should include or identify an automated test that fails on the merge-base and passes on the proposed head. The test may be new or existing, but its assertions must not be weakened to obtain a pass. Pure refactors must preserve relevant existing coverage; documentation, tooling, dependency and CI-only changes require proportionate validation instead. This is a guideline rather than a rule, because I do not want pointless red-green unit tests. I once had a test that tested if the saturation level was over 95%, which is utterly redundant. Please don't overdo this!


---

## Project Context
Lacuna is a prototype alpha project. Suggest sweeping changes that affect the codebase optimised for long-term stability and performance as well as features.
