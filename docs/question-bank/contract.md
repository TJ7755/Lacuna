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
`MarkAllocation`, the smallest existing attributable criterion. Knowledge remains linked through
`targetConceptIds`; application
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
explanation steps are not evidence of uncued transfer. Targeted selection and evaluation remain
subsequent slices.

## Multiple science techniques

`science-techniques` version 1 supports several defined techniques on one marking criterion.
The supported identities and their definitions belong to
[the technique registry](../../src/questions/techniqueTags.ts). `science-explanations` version 1
keeps its original single-skill meaning; existing tags and receipts are not rewritten.

```json
{
  "taxonomyId": "science-techniques",
  "taxonomyVersion": 1,
  "techniqueIds": ["causal-link", "paired-comparison"],
  "provenance": { "source": "author" }
}
```

Only tag skills actually required by that criterion. Several tagged skills do not multiply its
marks or the Concept evidence it can supply. Duplicate or unsupported identities are rejected.
Question-level skill coverage is the union of its criteria, not a declaration that every answer
demonstrates every skill. The broader registry is a classification contract, not an accuracy or
science-wide content claim. Existing library content needs separate review before retagging or
publication; no automatic library migration is performed.

## Combined marking and diagnosis

When Jev marks a written criterion with supported technique tags, the same provider request asks
separately about knowledge, application and each named technique. Each returns `gap`, `no-gap` or
`insufficient-evidence` with its own confidence. Several gaps may coexist. The existing UI
requests only the criterion the learner opens; this does not mean one request marks an entire
submission. Batch callers also combine marking and diagnosis in their existing call. No second
diagnosis request or per-tag network fan-out is added. Untagged criteria retain mark-only behaviour.
Results must match the requested taxonomy and exact category set, including when reading a saved
receipt. A result for another criterion's skills cannot supply evidence for this one.

The model uses only the supplied answer and authored criterion. Missing knowledge cannot be
distinguished from an unexplained omission merely because a mark was lost. Blank answers always
produce insufficient diagnostic evidence; diagnostic confidence below 0.85 also abstains without
changing confidence in the mark. This threshold is an initial policy, not a calibrated reliability
claim. [#905](https://github.com/TJ7755/Lacuna/issues/905) still gates public marking/diagnosis.

Combined results are retained in optional attempt-level `jevAssessmentReceipts`, alongside the
immutable submitted answer and authored-content receipt. They record the original mark or
abstention, marking provenance, taxonomy version and separately confident diagnostic outcomes.
Learner overrides replace the effective mark but retain these original receipts. Peer merge unions
competing receipts for audit rather than treating a diagnostic disagreement as a disagreement in
marks. Backups and sync retain them; published course content does not contain learner attempts.
Older strict application versions cannot read these new receipts and need updating before import.

Concept practice consumes supported diagnostic receipts to prioritise fresh questions for the
same Concept and required technique. It excludes overridden, disputed, undone, assisted,
corrected and superseded-content evidence, and abstains on competing receipts or uncertain
categories. A lost mark does not downgrade every tagged skill. No-gap evidence remains contextual
to its Concept; it does not establish general technique mastery or update Card FSRS state.
Knowledge gaps take priority over technique-only gaps, with a match to both preferred when
available. Novelty and finite family-capacity rules remain in force; exhaustion requires explicit
familiar practice. Retaining a model result alone does not make it independent evidence or
authorise practice-priority changes. Device cache keys include
the diagnostic request, rubric and policy; diagnostic evidence can be cached even when the mark
abstains. The route continues to report actual batch input tokens once and `Server-Timing`;
one HTTP request does not establish a token-cost saving. No live diagnostic accuracy, latency or
cost benchmark is claimed by synthetic transport tests.

## Maintain criterion classifications

In the Question Set composer, open a row’s **What it tests** menu. Each marking point keeps its
assessment dimension and has a separate **Exam techniques** field. Definitions come from the
versioned registry above; select every technique actually required by that criterion. Use
**Link to knowledge** for existing Concept identities rather than creating Concepts named after
techniques. Combined Concept links remain combined evidence, without separate Concept grades.

**Unclassified** removes the classification. Choosing a taxonomy with no techniques selected
records an explicit none-of-these outcome. Opening existing content preserves its taxonomy and
provenance; an edit records an author correction. Legacy `science-explanations` tags remain in
their original taxonomy unless the author explicitly changes it. Review the classification after
changing the question or rubric. There is no automatic classifier or keyword tagging: an organic
substitution reaction does not imply the mathematical `substitution` technique.

Save through the existing draft and Question Set revision workflow. Existing Attempt receipts keep
their original tags and marking evidence. For generated families, edit the source bank and import
a higher `bankVersion`; the composer shows its technique tags read-only because the family template
must supply them to every resolved variant. Published Course editing locks still apply.

Before reviewing or updating library content, audit the actual frozen Course file or portable bank:

```sh
bun scripts/question-bank.ts audit course.lacuna course-audit.json
bun scripts/question-bank.ts audit bank.json bank-audit.json
```

The read-only audit reports the exact input SHA256 and Course lineage/revision or bank identity/version.
It lists criterion mappings, unlinked/single/combined Concept attribution, unresolved Concept references,
unclassified/explicit-none/tagged criteria, and distinct Questions per technique and taxonomy version.
It never writes the source; an output path must be new, or omit it to print JSON. Reports include
authored criterion text, so keep reports from private or licensed sources with their authorised content.

Bank counts cover static sets and one template per family, not all numerical variants. Course counts
cover stored Question Sets; legacy individual Questions are reported as excluded. Counts describe
authored demand, not fresh transfer capacity, diagnostic accuracy, learner mastery or complete syllabus
coverage. Preserve unclassified content until its demands have been reviewed. Publication still needs
the existing exact-artefact review and approval in [the library procedure](../library.md).
