# Portable Question banks

Each static set and family carries a source title, reference, author and licence, plus a blueprint
with skill, type, difficulty and context. Record references accurately: a licence string is a
provenance assertion, not a grant of rights by the application.

Commands run from the application worktree with the repository's Bun version:

```sh
bun scripts/question-bank.ts validate bank.json
bun scripts/question-bank.ts materialise bank.json materialised.json
```
