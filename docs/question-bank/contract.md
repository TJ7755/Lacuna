# Portable Question banks

Each static set and family carries a source title, reference, author and licence, plus a blueprint
with skill, type, difficulty and context. Record references accurately: a licence string is a
provenance assertion, not a grant of rights by the application.

Commands run from the application worktree with the repository's Bun version:

```sh
bun scripts/question-bank.ts validate bank.json
bun scripts/question-bank.ts materialise bank.json materialised.json
```

## Science explanation pilot

The initial scope for [#902](https://github.com/TJ7755/Lacuna/issues/902) is Edexcel
International GCSE Biology 4BI1 enzyme explanations. The portable-tag slice of
[#556](https://github.com/TJ7755/Lacuna/issues/556) adds optional `techniqueTags` to each
`MarkAllocation`, the smallest existing attributable criterion. It does not diagnose answers
or change practice selection. Knowledge remains linked through `targetConceptIds`; application
remains an assessment dimension. Neither is a technique tag.

```json
{
  "taxonomyId": "science-explanations",
  "taxonomyVersion": 1,
  "techniqueIds": ["causal-link"],
  "provenance": { "source": "author" }
}
```

Version 1 contains one skill: **causal-link**, connecting a relevant scientific mechanism to its
consequence rather than listing facts. For example, connect a changed active site to reduced
substrate binding and a slower reaction. Knowing what an active site is belongs to Concept
knowledge; applying that knowledge to a new setting is an application demand. A missing causal
link cannot be inferred merely from a lost mark, particularly when the criterion also requires
knowledge that the learner has not demonstrated.

Absent tags mean unclassified. An explicit empty `techniqueIds` array means the classifier found
no applicable skill in this taxonomy. A Jev classification records
`"provenance": { "source": "jev", "model": "<model identifier>" }`; this contract does not
implement automatic classification. Author corrections use `source: author` and the existing
Question Set revision mechanism. Unknown taxonomy versions, skills and provenance fields are
rejected rather than silently discarded. Reclassification and author-correction precedence need
their own implementation before automated tagging is enabled.

Tags describe what is assessed, not whether a learner succeeded or why they lost a mark. They
remain authored content in course shares, backups, sync and immutable attempt receipts, with
stable taxonomy IDs across entity-ID remapping. A tag edit changes the content revision but does
not make a previously seen question unfamiliar. No learner diagnoses belong in published tags,
and no tag updates Card recall schedules.

Existing untagged Question Sets and schema-version-1 banks remain valid. Tagged banks use an
optional extension to the same schema; older applications with strict codecs reject tagged
content. They must be updated before importing it. Reverting the application after storing tags
also requires a compatible version to read them; there is no destructive migration or automatic
tag removal.

The preliminary frozen-content inventory found four enzyme sets, 22 questions, 30 scored parts
and 65 marks in 4BI1 revision 29. This is not a coverage or transfer certification. Before pilot
publication, [#907](https://github.com/TJ7755/Lacuna/issues/907) must supply a reviewed tagged
artefact, supported repair and an independent retest pool. Existing prompts that supply the
explanation steps are not evidence of uncued transfer. Combined marking/diagnosis, separate
learner evidence, targeted selection and evaluation remain subsequent slices.
