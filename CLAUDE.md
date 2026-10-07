# Lacuna CLAUDE.md

@AGENTS.md

<!-- Every other harness picks up AGENTS.md on its own. Claude Code only reads CLAUDE.md, so the
     import above is what pulls the house rules in. Do not remove it. -->

These are Claude-specific instructions. The house rules live in `AGENTS.md` and apply to you in full; this file only adds what is specific to Claude Code. Where the two conflict, ask.

Throughout this file, "I", "me" and "my" mean Tom, the user. "You" means Claude, reading this. Never write about yourself in the first person here when I ask you to write to CLAUDE.md.

---

## Crypto changes

Changes to nonce, AAD, KDF or keybag layout need `/security-review` and a human read, because incorrect handling produces code that passes every test and is broken.

---

## Pull requests

You are explicitly allowed to merge or close any pull request, including your own and Dependabot's, once you judge it done (CI green on the current head, no merge conflict, no open review thread), unless I have said otherwise for that pull request. You do not need to ask first. Crypto changes (above) still need the human read before merging. When asked to clear the pull request queue, merge or close every pull request in scope; leaving one open is not finishing.

---

## Other

- Background as many commands as possible so I can keep chatting to you while they run.
- Only use MCPs like browser use, Figma, Blender or computer use when I allow you to.
- Ask me questions — loads of them. Make sure you know everything you need rather than making things up. If things are obvious, don't ask.
- I have usage limits. Be terse with code, reasoning and output tokens.
- Add a fragment in `docs/changes/unreleased/` (see its README) after any applicable change or lesson learned; never edit `docs/CHANGES.md` directly. It directly helps future models.
