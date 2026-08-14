export const meta = {
  name: "read-mode-audit",
  description: "Audit where Read mode leaks editing affordances, and how the gate is implemented",
};

const AUDIT = `
Read AGENTS.md first and follow the house rules: British English, no emojis, no subagents, report
real evidence rather than describing it.

# This is an audit, not a fix

**Do not change a single line of code. Do not commit. Do not create a branch.** Your entire output
is the audit. If a fix is obvious, describe it; do not apply it.

Another worker is active in \`src/pages/learn/\` diagnosing a separate bug. Stay read-only and you
cannot collide with it.

# The report

A course page has a **Read / Edit** toggle in its header (top right, next to the Path / Question
bank / Analytics / Settings tabs). The user reports:

> "even read mode has the add manual [practice] in it. I bet that's not the only instance of read
> mode having edit features."

Specifically, the "+ Manual practice" affordances on the course Path view remain present and
apparently usable in **Read** mode. He suspects it is systemic rather than a one-off.

**Test that suspicion.** He may be right or wrong, and both answers are useful. Do not set out to
confirm it.

# What to establish, in order

**1. How is the gate actually implemented?** Find the Read/Edit toggle, what state it sets, and how
that state reaches components. This is the most important question, because it determines whether
leaks are a handful of oversights or an architectural gap.

A quick grep for the obvious names (\`editMode\`, \`isEditing\`, \`canEdit\`, \`readOnly\`) did not
find an obvious central mechanism. That is a hint, not a conclusion — find what is really there.
Say plainly whether there is a single source of truth or whether each component decides for itself.

**2. Enumerate every leak.** Sweep the course page and everything it renders — the Path view, the
lesson view, notes, the card list, sequences, occlusions, practice nodes, the tab bar. For each
mutating affordance, determine whether Read mode hides it, disables it, or leaves it live.

Use more than one search angle, because one will not find them all:

- by control: buttons, icon buttons, menu items, drag handles, inline-editable text
- by verb: create, add, new, edit, rename, delete, remove, reorder, move, import, link
- by handler: \`onClick\` / \`onSubmit\` handlers that call a repository write
- by component: anything rendering a form, a delete icon, or a pencil icon

**3. Distinguish three severities**, and label every finding with one:

- **Cosmetic** — the control is visible but inert. Confusing, not dangerous.
- **Live** — the control is visible and actually performs a write in Read mode. This is the real
  bug class.
- **Reachable** — the control is hidden, but the underlying route, keyboard shortcut or command
  palette entry still reaches the mutation.

A visible-but-inert button and a working delete button are not the same finding. Do not report them
at the same weight.

**4. Say what Read mode is actually for.** Search \`docs/\` for its intent. If the documentation
does not say, say that — it matters, because "Read mode is a focus mode" and "Read mode is a safety
guarantee" imply very different fixes, and nobody should guess which one this is.

# Evidence

Cite file and line for every finding. Where you claim a control performs a real write in Read mode,
trace the path from the handler to the repository call and quote it. Do not infer from a name.

If you can run the app (\`bun run dev\`) and confirm a leak by clicking it, that beats static
reading — say which findings you confirmed that way and which are static only.

# Report

Your final message is the return value.

- **The mechanism**: how the gate works today, in a short paragraph. Single source of truth, or not.
- **Findings table**: file, line, control, severity (cosmetic / live / reachable), confirmed how.
  Ordered by severity.
- **Was the user right?** Answer directly: is this systemic, or is the Manual practice pill an
  isolated oversight?
- **The shape of the fix**: is this N small patches, or one gating mechanism the components should
  consult? Recommend one, and say what it would cost.
- **Verified clean**: which surfaces you checked and found correctly gated. This matters as much as
  the leaks — it says how much of the app has actually been established as sound.

If Read mode turns out to be correctly gated nearly everywhere, say so plainly. Do not pad the
findings to justify the audit.
`;

phase("Audit");
const audit = await agent(AUDIT, { worker: "grok", label: "read-mode-leaks" });

complete({ audit: audit?.output ?? audit });
