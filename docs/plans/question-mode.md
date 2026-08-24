# Questions mode

**Status:** v1 implemented as a separate post-instruction experiment. Path integration is deferred.

**Scope:** distinguish direct-recall Cards from application Questions; give Questions their own
authoring, practice, evidence, scheduling and analytics; connect both content types through stable
Concepts without claiming that their evidence is interchangeable.

**Delivered baseline:** schema v24, full-backup format v11 and Course-share payload v3.

## Product decision

Lacuna now exposes two deliberately different learning activities:

- **Cards** ask for direct recall of one Concept.
- **Questions** require the learner to select or apply knowledge in a problem context.

Questions are an explicit experiment in a separate course tab:

```text
Path | Cards | Questions | Analytics | Settings
```

Questions never appear in ordinary Card study, Practice nodes, assessment revision plans or the
Course path conductor. The separation makes the experiment measurable and reversible. Integrating
Questions into the Path before their selection and scheduling evidence is calibrated would make a
prototype policy look like a settled learning model.

Questions are **post-instruction only** in v1. Every native Attempt is recorded with that purpose.
Pretesting can improve later learning when learners receive the answers afterwards, but its effects
vary and evidence for transfer is more limited. Productive-failure designs can also work, but only
under deliberately constructed problem-solving-then-instruction conditions. Lacuna therefore does
not silently turn a pre-instruction failure into an FSRS lapse; a future pretesting mode would need
its own evidence semantics and instructional flow.
([Pan and Carpenter, 2023](https://doi.org/10.1007/s10648-023-09814-5);
[Sinha and Kapur, 2021](https://doi.org/10.3102/00346543211019105))

## Canonical vocabulary

The root [domain glossary](../../CONTEXT.md) is authoritative. In this feature:

| Term                     | Meaning                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Concept**              | A stable course-scoped identity for one piece of knowledge.                                                                           |
| **Card**                 | A direct-recall presentation of one Concept. Existing front/back, reversed, cloze, sequence and occlusion presentations remain Cards. |
| **Question**             | A fixed authored application problem with its own schedule.                                                                           |
| **Question family**      | A built-in generator configuration whose resolved variants share one Question schedule.                                               |
| **Attempt**              | An immutable receipt for one shown fixed Question or resolved family variant.                                                         |
| **Primary Concept**      | The one Concept the Question is intended to practise. The UI calls it the **Primary skill practised**.                                |
| **Prerequisite Concept** | A Concept needed to solve the Question but not independently diagnosed by its result.                                                 |

The existing **Practice node** remains a Path milestone that selects eligible Cards. It is not a
Question and does not launch Questions mode.

## Domain invariants

### One primary Concept

Every Question and Question family has **exactly one** primary Concept and zero or more prerequisite
Concepts. The relationship aggregate rejects:

- a missing or second primary Concept;
- duplicate links;
- a Concept used as both primary and prerequisite; and
- cross-Course references.

Storage keeps the primary relationship as an array so multi-primary Questions need not force a
schema migration, but the v1 repository contract accepts exactly one entry. Relaxing that rule
would require a credit-attribution and scheduling model; merely permitting another identifier
would solve nothing.

The primary Concept describes author intent. A Question result does not prove mastery of that
Concept, and it says even less about its prerequisites. A wrong solution can arise from choosing the
wrong method, forgetting a fact, mishandling a sign or making an arithmetic mistake.

### Isolated evidence

Card and Question evidence never cross-write:

- a Question answer changes only that fixed Question or Question family;
- a correct Question does not review a linked Card;
- an incomplete Question does not fail a linked Card;
- a Card review never updates a Question schedule; and
- Card readiness, Question performance and their analytics remain separate.

Concept links support organisation, session interleaving, coverage and later remediation. They do
not create a combined mastery score. The testing effect is reliable in classrooms, and retrieval
practice can transfer to new contexts, but transfer is smaller and depends on the relation between
practice and final tasks. That supports application practice; it does not justify laundering one
kind of evidence into another.
([Yang et al., 2021](https://pubmed.ncbi.nlm.nih.gov/33683913/);
[Pan and Rickard, 2018](https://pubmed.ncbi.nlm.nih.gov/29733621/))

## Question content

### Fixed Questions

A fixed Question stores:

- an authored Markdown prompt;
- a deterministic numeric answer or compiled working mark scheme;
- a mandatory worked explanation;
- exactly one primary Concept and optional prerequisite Concepts; and
- lesson membership, tags and suspension state.

The editor refuses to save a fixed Question without a prompt, valid answer and worked explanation.
Explanatory feedback matters most when learners must transfer what they learnt to new inference
questions, so the explanation is content, not decorative metadata.
([Butler, Godbole and Marsh, 2013](https://eric.ed.gov/?id=EJ1007933))

### Generated Question families

A Question family stores a built-in generator key, version and validated configuration. The
registry resolves a deterministic seed into a complete prompt, answer, worked explanation,
serialisable parameters and fingerprint. The Attempt stores that complete resolved receipt before
the learner sees it.

The first family generates integer-root quadratic equations constructively. The registry audits a
bounded deterministic corpus and rejects invalid configuration, ambiguous answers, degenerate
problems and unsupported versions. Course content cannot carry executable JavaScript, Python or
another user-authored generator.

Generated variants share the family's schedule; they never become Cards or separately scheduled
definitions. Varying application examples can improve transfer, but family-level scheduling is an
engineering experiment, not a claim of calibrated family retrievability.
([Butler et al., 2017](https://pubmed.ncbi.nlm.nih.gov/29265856/))

## Attempts, checking and feedback

An Attempt begins as an immutable presentation receipt. It records the exact prompt, answer
specification, worked explanation, content revision and scheduling epoch shown. A generated Attempt
also records its generator version, seed, parameters and fingerprint. Leaving the session records an
abandoned presentation but no scheduling evidence.

The learner checks an answer before submitting it. The first submission is immutable once recorded:
its answer, marks and line verdicts cannot be replaced by a later clean solution. After viewing the
mandatory worked feedback, the learner may record one separately immutable correction. The
correction documents learning after feedback; it never rewrites the first-attempt evidence or
changes that Attempt's schedule effect.

Checker disputes and undetermined working-line verdicts retain the receipt and raw marks but
**withhold scheduling**. Treating an uncertain automatic verdict as a known success or failure
would corrupt the evidence stream. Undo likewise retains the Attempt and marks it as excluded from
schedule replay.

## Scheduling semantics

Questions use a dedicated adapter over the installed FSRS engine. Each fixed Question has one
Question schedule; every variant of a generated family updates its family's one schedule. The UI
labels the output **due** and **Question practice**, not calibrated Concept mastery.

Automatic grading is intentionally conservative:

| Evidence                                               | FSRS grade    | Schedule effect            |
| ------------------------------------------------------ | ------------- | -------------------------- |
| Full marks, no dispute or undetermined verdict         | **Good (3)**  | Successful review          |
| Any incomplete result, including partial marks         | **Again (1)** | Failed review              |
| Disputed or undetermined checking                      | None          | Scheduling withheld        |
| Shown, abandoned, corrected or undone lifecycle change | None          | No new scheduling evidence |

Partial credit must not map to **Hard**. In FSRS, Hard is a successful recall rating and therefore
increases stability; official guidance describes Again as failure and Hard/Good/Easy as passing
ratings. Calling an incomplete solution Hard would quietly lengthen its interval. Questions also do
not infer Easy from response time, and learners cannot override the automatic grade.
([FSRS tutorial](https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md?plain=1);
[FSRS algorithm](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm/259410b810c39a3bd46f5a2f96e89a4110246813))

Semantic edits start a new scheduling epoch. Previous Attempts retain their original receipts and
schedule effects, so an answer-key change cannot reinterpret old evidence. Peer merge derives the
current schedule by replaying eligible Attempt evidence rather than trusting a copied denormalised
schedule row.

## Selection and product flow

The Questions tab lives at `/course/:courseId/questions`; authoring uses
`/course/:courseId/questions/new` and `/course/:courseId/questions/:questionId/edit`; practice uses
`/course/:courseId/questions/learn`.

The default practice session contains at most ten Questions:

1. due Questions and families first, ordered by due time;
2. unseen fixed Questions before unseen generated families;
3. target Concepts interleaved when another target is available; and
4. suspended Questions excluded.

**All due** selects the complete due pool. Interleaving is a local selection heuristic, not a claim
that mixed practice always wins: the evidence is positive for mathematics but varies sharply by
material, and some verbal categories favour blocking.
([Brunmair and Richter, 2019](https://pubmed.ncbi.nlm.nih.gov/31556629/);
[Rohrer et al., 2020](https://ies.ed.gov/use-work/awards/efficacy-study-interleaved-mathematics-practice))

Every selected Question persists its receipt before rendering. Fixed exposure history lets the
selector distinguish unseen from familiar problems. Generated fingerprints distinguish novel and
repeated variants without assuming that a new surface form is a new scheduled identity.

## Analytics

Question analytics are separate from Card readiness and the Course's exam-day Card objective.
They report:

- due, unseen and suspended Question counts;
- fixed Questions split into **first presentation** and **repeat** performance;
- generated families split into **novel variant** and **repeated variant** performance;
- generated unique-variant count, presentation count and repeat rate;
- earned/available marks and full-credit accuracy;
- criterion results keyed by content version, criterion index and label; and
- exclusions for shown, abandoned, undone, checker-withheld and unscored Attempts.

First/repeat and novel/repeat are not interchangeable. A fixed Question is familiar after its first
presentation even if it was abandoned. A generated variant is novel only until its fingerprint has
been presented once. Only active, graded and machine-scored first submissions contribute to
accuracy; a disputed result is not relabelled as a failure merely to make the denominator
convenient.

No Card objective, predicted exam score or Card calibration metric includes Question Attempts.

## Persistence and portability

Schema v24 adds `concepts`, `questions`, `questionConcepts` and `questionAttempts`, and assigns every
surviving Card a Concept. Known legacy numeric and working Cards migrate to fixed Questions through
a pure deterministic converter. Their available historical evidence becomes Question Attempts;
unsupported or distribution-protected payloads remain compatible Cards rather than being guessed
through a lossy conversion. The destructive migration requires a pre-migration restore point.

Full-backup format v11 requires all four Question collections. Older backups are normalised through
the same pure v24 conversion before replace or recover-merge. Replace restores the Question tables;
recover-merge combines coherent authored Question bundles and unions Attempt lifecycles. An
immutable receipt collision fails instead of inventing a winner. Schedule state is replayed after
merge.

Peer snapshots, tombstones, diagnostics and asset reachability include Question data. Deleting a
Question removes its definition and Concept relationship but retains personal Attempts as readable
evidence. Deleting a Course removes its Concepts, Questions, relationships and Attempts. Backup and
asset collection scan both authored Question definitions and retained Attempt receipts.

Course-share payload v3 carries Concepts, Question definitions and relationships, but excludes
personal Attempts and scheduling state. Unknown generator versions are preserved at compatibility
boundaries and cannot enter practice until supported. Human-readable CSV, TSV, Markdown and Anki
exports remain Card-only; a full backup or Course share is required for Questions.

Search and MCP expose Cards and Questions as different kinds and route them to different editors.
New structured numeric and working content is authored as Questions rather than Cards.

## Deferred work

- Questions in Practice nodes, assessment revision plans or the Course path conductor.
- A mixed Cards-and-Questions session.
- Multi-primary Questions and credit attribution.
- Combined Card/Question mastery, readiness or cross-writing of evidence.
- Pre-instruction Questions or productive-failure lesson flows.
- Declarative or user-authored generators and arbitrary executable generator code.
- Open-ended prose, proof, diagram or essay marking.
- Population-fitted generator difficulty or a claim of calibrated family retrievability.

## Verification contract

The v1 release must prove:

- every Question has exactly one same-Course primary Concept;
- Card and Question histories, schedules and analytics remain isolated;
- full marks map to Good, incomplete marks map to Again, and uncertain checking withholds scheduling;
- first submissions and corrections remain separate immutable evidence;
- fixed first/repeat and generated novel/repeat analytics use presentation history correctly;
- generated receipts are deterministic and survive backup, share and sync;
- deletion, tombstones, restore and merge retain or remove Question data according to the rules
  above; and
- no Question enters the Course path or ordinary Card study.

Repository, migration, scheduler, selection, analytics, portability, sharing, sync, UI and route
tests cover these boundaries. The manual browser pass is specified in
[`docs/WEBSITE_TEST_CHECKLIST.md`](../WEBSITE_TEST_CHECKLIST.md).
