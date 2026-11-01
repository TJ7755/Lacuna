# Portable Question banks

Each static set and family carries a source title, reference, author and licence, plus a blueprint
with skill, type, difficulty and context. Record references accurately: a licence string is a
provenance assertion, not a grant of rights by the application.

Commands run from the application worktree with the repository's Bun version:

```sh
bun scripts/question-bank.ts validate bank.json
bun scripts/question-bank.ts materialise bank.json materialised.json
```


## Review before publication

Only tag techniques actually required by a criterion. Review classifications after changing
the question or rubric. Preserve unclassified content until its demands have been reviewed.

```sh
bun scripts/question-bank.ts audit course.lacuna course-audit.json
bun scripts/question-bank.ts audit bank.json bank-audit.json
```

Keep reports containing private or licensed criterion text with their authorised content.
Review the exact frozen artefact and follow [the publication procedure](../library.md).
