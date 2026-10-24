# Working in Lacuna

Use source, tests and configuration to establish current behaviour. These pages retain decisions,
non-obvious boundaries and operator procedures. [CONTRIBUTING](../CONTRIBUTING.md) owns validation
and review policy. Read the relevant section,
not the entire documentation tree.

## Difficult entry points

- Course path and access: [CoursePath](../src/pages/CoursePath.tsx),
  [lessonViewMode](../src/course/lessonViewMode.ts), [path tests](../src/course/path.test.ts).
- Imports and published updates: [share](../src/db/share.ts), [mergeImport](../src/db/mergeImport.ts),
  [lineage tests](../src/db/lineageDiff.test.ts). Course files wrap the same share payload.
- Generated Concept identity: [Sequence](../src/db/sequenceRepository.ts),
  [Occlusion](../src/db/occlusionRepository.ts), and ordinary share import above are all writers.
- Study selection and evidence: [useLearnSession](../src/pages/learn/useLearnSession.ts),
  [session tests](../src/fsrs/session.test.ts), [Question repositories](../src/questions/repository.ts).
- Desktop security and transport: [securityPolicy](../electron/securityPolicy.ts),
  [MCP build](../electron/mcp/build.mjs), [native tests](../tests/e2e-electron/).

## References

- [Visual intent and Lacuna Flow principles](spec/visual-design.md).

- [Concept application practice decision](adr/0001-concept-application-practice.md) and
  [portable bank authoring](question-bank/contract.md).
- [Domain language](domain-language.md) and [engineering pitfalls](maintenance/engineering-notes.md).
- [Desktop and AI setup](desktop.md), [release procedure](maintenance/release.md),
  [repository policy](maintenance/governance.md), [security reporting](../SECURITY.md).
- [Gaps teacher entry and encryption boundaries](gaps.md).
- [Course library and hosting](library.md).
- [Landing films and owner media-domain switch](landing-media.md).
- [Manual release checks](WEBSITE_TEST_CHECKLIST.md), [performance measurement](PERFORMANCE.md),
  [compatibility boundary](storage-v22-compatibility.md), [scientific limits](scientific-assessment.md).

[Issues](https://github.com/TJ7755/Lacuna/issues) own unfinished work, including
[redesign acceptance](https://github.com/TJ7755/Lacuna/issues/456#issuecomment-6246871342).
[Release history](CHANGES.md), [earlier releases](https://github.com/TJ7755/Lacuna/blob/b7995873874bbf4d5074430b34481491cc59588c/docs/archive/changes-through-0.2.7.md) and
[dated measurements](https://github.com/TJ7755/Lacuna/tree/30d7e808f9b056afcfd61702c6de7d4ee204e759/docs/performance)
are historical records. Old measurements and review captures live in Git history.

Change behaviour in code and meaningful tests. Update a retained decision or procedure when that
changes, and add an [unreleased fragment](changes/unreleased/README.md). Avoid copying record
shapes, dependency versions, commands already listed in the manifest or transient PR/check status.
`bun run docs:check` checks relative file links; it does not prove the prose true.
