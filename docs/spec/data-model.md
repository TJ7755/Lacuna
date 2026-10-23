# Data ownership and persistence boundaries

The [types](../../src/db/types.ts), [schema](../../src/db/schema.ts) and
[Question types](../../src/questions/types.ts) define record shapes and migrations.
The [domain glossary](../domain-language.md) defines the product vocabulary. Do not reconstruct
current fields or versions from this document.

## Course architecture

Courses contain Lessons, Notes, Cards and assessment/path structure. Scheduling units own active
workload and goals; Course rows retain path and assessment semantics. Retired Deck/Folder types
exist at compatibility boundaries, not as another product hierarchy.

Lesson membership can link an existing Card without copying it. Deduplicate by Card identity;
a link does not create another FSRS state or change the primary Lesson's scheduling horizon.
Lesson exposure records establish where material was encountered. Legacy display-only links do
not prove an exposure. Practice completion evidence is separate from live predicted readiness.

Repository operations own transaction scopes, cascades, review history and tombstones. A change
that adds stored metadata must inspect all writers and all portability paths, not just its setter.

## Review history

Canonical review events are the stored evidence; a Card's inline history is a runtime projection.
Migrations verify copied history before removing duplicate inline events. Legacy imports are
normalised at the boundary. Derived review activity is maintained in the same transaction as
canonical history and is rebuilt rather than exported as independent evidence.
Trajectory samples are chart data recorded after a review commits. They do not feed back into
grading, unlocks or scheduler decisions, and historical rows are retained.

## Concepts and Questions

A Card presents one Concept. Questions have their own Attempts and scheduling. Neither evidence
pipeline writes the other's history. An Attempt retains the exact presented definition, generated
variant and marking context. The first submission is immutable; a correction is separate evidence.

Sequences and Occlusions are authoring entities which generate ordinary Cards. Regeneration
preserves surviving Card identity and FSRS state. Removing a source item can remove its generated
Cards; changing cues or geometry must not reset surviving memory state. Review
[Sequence writes](../../src/db/sequenceRepository.ts), [Occlusion writes](../../src/db/occlusionRepository.ts)
and [ordinary share import](../../src/db/share.ts) together when changing generated Concept identity.
Native generator IDs and imported/remapped IDs must remain coherent.
Ordinary imports remap generator and item/region IDs before deriving generated Concept IDs, using
the same mapping for Card and Question relationships. Regeneration reuses a surviving sibling's
Concept, including legacy non-deterministic IDs, and retains its shared metadata. Missing generated
faces must not discard specification links or move ordinary Cards and Questions to another Concept.
Occlusions retain non-deterministic historical region relationships in optional `regionConceptIds`,
recorded from existing Cards before removal. Regeneration validates same-Course ownership and retains
the complete Concept. Backups and encrypted snapshots preserve this additive metadata; current share
codes and Course files remap active region relationships alongside Concept IDs. Older share readers
ignore this optional field and cannot promise this repair for historical arbitrary IDs. No schema
index or cryptographic format changes. An association already lost before this metadata was recorded
cannot be reconstructed safely; do not guess from names or merge unrelated Concepts.

Sequence entry starts with Name focused and one blank item. The type sets its terminology and
cue defaults; secondary settings and generated previews remain under Options and Preview. Script
speakers stay beside their lines, and Your part selects the generated lines. Enter splits at the
caret and focuses the next item; Shift+Enter inserts a line break. An empty item's Enter can start
a named section. Alt+Up/Down reorders; Backspace at the start joins or removes a section break.
Pointer/touch Delete remains available. Focus/scroll respect motion preferences.

Forward Tab from the last item's content focuses Add sequence / Save changes without submitting;
earlier items, backward Tab and unavailable save targets retain native traversal. Ctrl/Cmd+Enter
saves the whole sequence and never inserts an item. Composition, including legacy key-code 229,
must not trigger row shortcuts. Empty items are scaffolding omitted from preview/save; an all-empty
outline still fails validation. Missing Name or script part focuses the relevant control. Multiline
paste inserts at the selection, preserving surrounding items and parsing speakers. The action bar keeps
shared page bounds at 320px with Larger text.

## Specification links

Optional Course `specificationRef` stores `{ specificationId, tier?, routeIds? }`; the Custom
`examBoard` and `specification` strings remain fallback text. Setting/clearing the reference does
not remove fallback text or existing Concept links. Selection UI is a separate stage.

Course-scoped Concepts may store unique `specificationPointIds` as qualified
`<specificationId>:<pointId>` catalogue IDs. Cards and Questions inherit these through Concepts;
legacy-scheduling-unit Concepts cannot carry them. Schema v30 adds only the multi-entry Concept
index without rewriting rows. Repository setters validate and stamp transactionally, honour
published-copy locks and retain unknown but valid IDs, including foreign or out-of-selection links.
Indexed point lookup stays within the requested Course. Sequence/Occlusion regeneration preserves
Concept links; published teacher replacement/removal retains its existing authority.

[Tag resolution](../../src/specifications/tagResolver.ts) proposes links from `spec:<ref>` and
`spec:<code>:<ref>` tags without changing records. References match exactly; qualification codes
ignore case. Repeated identical tags yield one proposal. Ambiguous/unmatched tags remain explicit,
as do retained foreign, unknown and out-of-selection links.

### Bundled catalogue identities

The [catalogue index](../../src/specifications/index.ts) validates bundled entries once and exports
`specificationCatalogue` and `findSpecification(id)`. It includes Pearson Edexcel International GCSE
Biology 4BI1, sourced from the official Issue 3 (September 2024) specification and its command-word
appendix. Paper 1 excludes B-suffixed statements; Paper 2 covers all content. The published AO
weightings are ranges, retained exactly in the objective descriptions; `weightingPercent` stays
absent rather than inventing a midpoint.

Specification IDs use `<board>-<qualification>-<code>`, all lower case, for example
`pearson-edexcel-international-gcse-4bi1`. Content point IDs are the board reference lower-cased,
including suffix letters: `2.15`, `2.14b`. Topic headings use their reference (`2`); lettered
sub-topics are qualified by topic (`2.e`). Unnumbered groups extend their enclosing heading
(`2.e.plants`, `2.e.humans`). Display references preserve the source spelling and case.

IDs are permanent once merged because user data stores them. A renumbered specification issue
must retain existing IDs or receive a new specification entry; never silently rewrite stored
identities. Titles are paraphrased labels for cross-reference, not substitutes for the source's
full teaching requirements. The public catalogue contains no learning content or copyrighted
vocabulary lists.

## Question sets and drafts

Question Set revisions save atomically with same-Course reference validation. Unchanged content
retains its revision identity. Attempts capture their content/scheme receipt in the same transaction
that reads the owning set. Concurrent incompatible receipts are conflicts; timestamps cannot select
a replacement. Submitted evidence cannot regress to an earlier lifecycle state.

Authoring drafts are device-local recovery data. An unresolved recovery prompt must not be
overwritten. Corrupt drafts remain available with an explicit error. Draft media remains reachable
for recovery, but drafts do not become backup, sharing or sync content.

## Portability exclusions

Device-local annotations and live AI session state are not general course content. Check
[portability boundaries](portability.md) before adding a field to a format. The authoritative
backup envelope/version is in [backupSnapshot](../../src/db/backupSnapshot.ts); accepted inputs are
in [backupValidation](../../src/db/backupValidation.ts). Course files delegate payload construction
to [share](../../src/db/share.ts), independently of their outer envelope version.

[Specification index](../SPEC.md)
