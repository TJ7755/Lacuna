# Questions: product and interface brief

**Date:** 26 September 2026

**Status:** Paper direction selected; authoring implementation has begun.

The Paper authoring interface now uses real drafts and saved sets. The
[implementation checklist](plans/question-sets-implementation.md) records completed
slices and remaining work; recorded set practice, marking and analytics are not yet available.

This is the consolidated design proposal for question sets, authoring, self-marking,
card connections and exam preparation. The [research note](question-sets-research-2026-09-26.md)
contains sources, competitor findings and modelling limitations. The historical
[Questions v1 plan](plans/question-mode.md) describes the delivered baseline, not this proposal.

## 1. Product intent

Teachers and learners can author and share realistic exam questions across subjects.
Learners answer them independently, compare their work with the author's mark scheme,
annotate it and award themselves marks. Connected cards support the underlying knowledge;
question practice records its application. Named exams give both activities a common goal.

The central experience is a readable paper with useful controls around it. Retain
Lacuna's existing typography, warm paper surfaces, restrained accent colour, rounded
containers and light/dark themes. Use cards to group related material, without boxing
every sentence or filling the screen with large status tiles. Content takes precedence
over scheduling terminology and metadata.

**Interaction priority:** keep the interface minimal and clutter-free, with one active
task at a time. Writing a question, defining its marks, linking concepts, answering
and self-marking are distinct steps. Show secondary navigation and settings on demand;
do not put all the fields and controls on screen simultaneously. Preserve the source
material needed for the current task so simplicity does not become constant context loss.

## 2. Content and evidence

| Element | Responsibility |
| --- | --- |
| Question set | Title, ordered questions, lesson links and named assessment links; the unit of sharing and a practice entry point. |
| Question | Shared stem/source material, diagrams and parts. A simple question can be directly answerable. |
| Part | Nested structure such as (a), (i), (ii); answerable parts own response format and marking criteria. Context-only parts need no answer field. |
| Mark allocation | Author-defined criterion, maximum marks, assessment dimension and relevant concept/skill links. |
| Atomic concept | Existing Concept identity for a specific piece of knowledge, connecting cards and question parts. |
| Attempt | Original submitted answers, scheme/content version, self-awarded marks, annotations, corrections and assistance context. |

Use **Atomic concepts** in the proposed linking interface, as requested by the prompter;
extend the existing Concept system rather than creating another entity. This is a proposed
terminology change from the current glossary, which will need updating when implemented.

A set can cover several lessons and exams; neither link is required to start authoring.
Exams are existing named assessments with dates, not dates copied into every question.
Moving an exam updates planning without rewriting previous attempts. Sets have no FSRS
state of their own. Shared content does not include the author's personal study history.

## 3. Navigation and entry points

Keep the course navigation: **Path · Cards · Questions · Analytics · Settings**, and
the existing **Study / Author** switch. Do not introduce a second course hierarchy.

- **Questions:** browse sets, start/resume practice, or author content.
- **Path:** an author can place a set after a lesson as a **Practice Qs** activity.
- **Lesson:** a compact related-sets section opens the same set detail screen.
- **Exam:** show relevant sets and recommendations for that assessment.
- **Card details:** show the question parts supported by that card's concept.

Navigation back from a set restores library filters and scroll position. Leaving a
practice session saves progress and returns to its entry point; resuming restores the
active question and scroll position. Do not require students to traverse the library
every time they return from a linked card.

## 4. Questions library

Use a compact header with the title **Questions** and search. Put optional lesson/exam
filters behind a Filters control and show selected filters only when active. Avoid
explanatory paragraphs about internal scheduling.

In **Study**, place one compact **Continue practice** row above the set list when an
unfinished session exists. Otherwise show a relevant **Start practice** recommendation
when there is enough information to make one. The complete set list remains available.

Each set row shows its title, question count, total available marks, linked lesson/exam
when present, and a plain status: **Not started**, **In progress**, **Needs marking** or
**Completed**. A completed result is labelled **Self-marked** and dated; it is not a
forecast. Opening a row opens the set detail view. Do not show Edit buttons in every
student row or display an empty due-count tile.

In **Author**, the primary action is **New question set**. Rows expose Edit and a small
overflow menu for sharing and removal. Search and filters stay in the same place.
Batch/generation tools remain secondary authoring tools, not the main library action.

Empty state: **No question sets yet**, with **Create a set** in Author mode and the
existing import/share entry point where appropriate. A filter with no matches offers
**Clear filters**, rather than looking like an empty course.

## 5. Set overview

Show the title, a compact summary of question count and marks, lesson links and the
selected exam/date where applicable. List questions by number with short titles or
stem previews, marks and attempt status. Do not reveal mark schemes in these previews.

The main action is **Start practice**, **Continue** or **Continue marking**, according
to the saved session. Completed sets offer **Practise again** and **View attempt**;
repeating starts a new attempt rather than replacing the old one.

Proposed session choices are **Practice** (feedback after each independent question)
and **Paper** (answer the set before revealing schemes). Practice is the default.
Paper mode is a feedback-timing choice; a timer is not required for the initial scope.
Where a later part depends on an earlier answer, reveal feedback after the dependent
group, not after each tiny subpart. Keep authored order within such groups.

## 6. Authoring workspace

### Layout

On wide screens, use a readable document editor for one selected question or part.
A collapsible outline provides navigation; it does not need to stay visible while
writing. The header contains the set title, saved state, **Preview** and **Done**.
The active editor step is **Question**, **Mark scheme** or **Links**. Switching steps
preserves drafts. Show one step at a time; do not stack their complete forms or add a
permanent third column for metadata. Lesson and exam settings open on demand.

On smaller screens, the outline becomes a **Questions** drawer and settings open as a
sheet. Editing itself stays in one column. No horizontal scrolling through form panels.

### Creating and organising content

New question set opens directly into a title field and the first question editor.
Do not require lesson, exam or concept configuration before typing a question.

Each question supports:

- Rich text through the existing Markdown/media system, including mathematics and tables.
- **Add image**, paste and drag/drop, with alt text and an optional visible caption.
- **Add part**, **Add subpart** and **Add question**, positioned beside the relevant content.
- A response-format control on answerable parts: **Written answer**, **Multiple choice**
  or **Calculation**. Written answer is the default. All are self-marked in this proposal.

Render numbering automatically as Q1, (a), (i), (ii). Moving content renumbers labels,
but stable identities preserve links and previous attempt records. Provide keyboard
Move up/down controls as well as any pointer-based reordering. Prevent invalid nesting.
Keep the initial hierarchy bounded to question, part and subpart.

A shared diagram stays at the parent level and is visible while editing or answering
its children. Multiple-choice options can contain text/images; authors identify the
correct option or options and specify whether the learner chooses one or several.
Calculations retain access to mathematical notation and existing numeric content.

### Mark scheme and allocation editor

Each answerable part has separate **Question** and **Mark scheme** editor steps, with
a learner preview available without leaving the workspace. In Mark scheme, expand
one allocation for editing and show the others as compact summaries. The scheme is
hidden from students until marking begins.

An allocation row contains:

| Field | Interaction |
| --- | --- |
| Criterion | Plain-language description of what earns the marks; allow richer supporting explanation. |
| Marks | Numeric maximum with clear inline validation. |
| Assesses | Knowledge, Application/reasoning or Exam execution. |
| Links | Search/select relevant concepts and skills; show compact chips once chosen. |

Authors decide the split. A six-mark part could allocate two marks to knowledge, three
to application and one to exam execution, but the interface must not impose that ratio.
Allocation maxima sum to the part total; question and set totals derive from their
scored children. Display a total mismatch next to the allocations, not only in a toast.

Allow partial marks, alternative acceptable responses, dependent criteria and holistic
level descriptors where the source scheme requires them. An inseparable mixed criterion
can remain mixed; it contributes once to the overall score without fabricating separate
dimension results. Multiple concept links never duplicate marks. The three dimensions
are not automatic substitutes for exam-board assessment objectives.

### Manual concept and card linking

The **Atomic concepts** panel offers search, select and create-in-place. Selected
concepts expose a preview of their related cards so the author can check the connection.
Allow several concepts per part, distinguishing those directly assessed from prerequisites.
The same concept can connect different card presentations to several questions.

Version one uses manual search and selection only. Authors can search for a concept
or card, inspect the related content and select the card's existing concept to establish
the connection. Show the resulting related cards before confirmation. Do not create
duplicate concepts merely because an author started from a card instead of a concept.
There is no Suggest links action, classifier integration or paid inference dependency.
Jev is deferred for possible later evaluation, not part of the first-version workflow.

### Saving and readiness

Autosave drafts locally and show **Saving…**, **Saved** or **Could not save — Retry**.
Incomplete content can be saved, but must pass validation before practice or sharing:
answerable content, usable scheme, valid mark allocations and valid referenced media.
Require concept attribution for knowledge allocations before treating them as linked
forecast evidence; unresolved links are shown as a coverage gap, not invented silently.

Done returns to the set overview. Preview uses the real proposed student layout and
never creates learner evidence. Removing content needs confirmation when it would
discard work; retain historical attempts against their original content versions.

## 7. Student answering screen

Use a focused study layout. The top bar contains Back, the set title, question position
and save state. The question, diagrams and answer area dominate the screen. Keep a
compact question navigator available without making it compete with the question.

Render one active answerable part at a time, with its number, available marks and
required parent context. Previous/Next navigation and an optional question drawer
provide access to other parts without displaying all answer fields at once. In Paper
mode the same navigation allows returning to answers before submission. Shared context
stays readily accessible; on desktop it can sit beside the response when needed, and
on mobile above it with a **View source** action for quick reopening. Diagrams can be
enlarged without losing an answer. Keep dependent-part submission and feedback rules
even though their answer fields are presented one at a time.

Written responses use a tall, expanding multiline field: approximately six visible
lines initially, with more room for extended responses. Do not force long answers into
a one-line input or a cramped nested scrollbar. Multiple choice uses labelled selectable
options; calculation responses support working as well as an answer. Save partial work
while the learner moves between parts.

The primary action is **Submit question** in Practice or **Submit paper** in Paper.
Before submission, identify unanswered parts and let the learner return or explicitly
submit them unanswered. Blank submissions are not silently assigned zero before marking.
Submitting captures the original response; it does not invent a successful result.

Related cards and lessons remain accessible through a secondary **Review knowledge**
action. Opening them before submission records the attempt as assisted. After submission,
they become an ordinary route to revision. The product records assistance rather than
blocking the learner from obtaining help.

## 8. Self-marking screen

Show one active marking criterion at a time, with its marks control and the original
response. On desktop the response and current criterion can sit side by side; on small
screens they share one vertical flow. Keep the overall criterion list and full scheme
behind an optional overview. Show compact progress and allow returning to earlier
decisions. Do not require repeated navigation between separate pages to compare an
answer with its current criterion.

For each allocation:

1. Read the criterion and any acceptable alternatives or level descriptors.
2. Highlight supporting text in the submitted answer and optionally add a comment.
3. Award a point with a tick for a one-mark criterion, or choose a value from zero to
   the maximum for a multi-mark allocation. **Unsure** is a separate state.

Do not preselect full marks or zero. The total updates as decisions are made and shows
**Provisional — 2 criteria unmarked** while unresolved. Provide **Save and finish later**;
only fully marked attempts show a completed score. Allow the student to revise a marking
decision while retaining the distinction between original work and corrected work.

Annotations initially mean text highlighting and attached comments, with accessible
Add note controls that do not require text selection. Freehand pen drawing is not assumed
by this brief. Corrections use a separate editable area; they never replace the submitted
answer or retroactively improve its first-attempt marks.

Optional reflection asks **What would you change?**, with concise reason choices such
as Forgotten knowledge, Applying the idea, Misread question, Missing evidence,
Calculation/units, Time, and Unsure. Allow more than one reason and an optional note.
Do not require a reflection essay on every correct answer.

Finish with **Save marks and continue**. If feedback reveals information needed by later
parts, retain that exposure context; subsequent answers cannot be counted as fresh,
unaided demonstrations.

## 9. Attempt results and the next action

Show the self-marked total first, followed by knowledge, application/reasoning and
exam-execution marks with their denominators. Mixed allocations appear explicitly.
These are descriptive results, not diagnoses of the learner's abilities.

Below, show the question list with marks, annotations and corrections available to reopen.
Offer one main next step supported by the evidence, such as **Review related cards** or
**Practise another question**. Preserve access to the other options. If no fresh question
exists, say so and offer a labelled repeat; do not pretend a repeat tests unseen transfer.

Keep completion and score distinct. A fully marked attempt earning zero is still completed;
completion does not mean mastery. Re-marking updates the recorded judgement and derived
analytics without making a second practice attempt or adding a card review.

## 10. Path and card integration

Practice Qs uses the path's existing visual language with a question/document icon and
the set title. Show progress as answered/marked questions, not the existing card
“secured” percentage. An optional assessment label opens that exam's readiness view.
Completion does not introduce a new hard lesson-unlock gate in this proposal.

Card details include **Used in questions**, listing set, question part and relevant
marking demand without revealing answers in an active attempt. Question details and
marking results include **Related cards**, grouped through their atomic concepts.
Multiple card presentations of the same knowledge do not count as separate concepts.

## 11. Exam-readiness screen

Extend the existing assessment/analytics experience rather than adding another top-level
destination. Select a named exam to see its date, covered material and evidence gaps.

Present three connected inputs:

- **Knowledge retention:** projected recall at this exam's date from linked cards.
- **Question performance:** first-attempt self-marked results by the author's allocations,
  with attempt count, recency and assisted/repeated context.
- **Coverage:** how much of the assessment's topic/skill/mark distribution has usable evidence.

The intended combined output is **Estimated exam score**, with a range and inspectable
knowledge/application/execution contributions when supported by a calibrated model.
The current card-recall percentage must not simply be relabelled as that score. Until
calibrated, show the separate inputs and **Exam estimate not yet available**. Missing
evidence is unknown, not a zero or a high-confidence pass.

Authors define the assessment's mark distribution independently of how many questions
they happened to write. Where that distribution is absent, show an estimate for covered
practice material only. Do not extrapolate a whole-exam mark from one well-practised topic.

The model should estimate each allocation once using relevant recall and question evidence,
then aggregate according to assessment coverage. Preserve dependencies, partial credit and
self-marking uncertainty. Do not add card recall percentages to awarded marks or impose
an arbitrary equal weighting. State whether a projection assumes no further study or
completion of a stated plan; planned reviews are not earned improvements.

A compact **What to practise next** section connects the evidence to actions:

| Pattern | Proposed recommendation |
| --- | --- |
| Weak projected recall and weak related answers | Relevant cards, then a fresh linked question. |
| Strong recall and weak application | A question practising that demand. |
| Strong repeated-question results only | An unseen check. |
| Missing assessed skill/topic evidence | Practice covering the gap. |

Treat these as explainable recommendations, not proof of the cause of lost marks.
Question attempts never silently alter card FSRS states. Author-defined links establish
relevance, not learner knowledge. Validation against later unseen work and an
independently marked sample is required before asserting examiner-mark prediction.

## 12. Sharing, resilience and accessibility

Extend existing sharing/import flows to include set structure, media, mark schemes and
concept relationships. Import presents the destination course and requires resolution
of lesson/concept/assessment links where necessary. Another learner's personal exam
dates and attempts must not silently become the recipient's study state.

Authoring, manual linking, answering and marking work offline using the existing local
persistence. Failed saves remain visibly failed with retry; never claim an answer is saved
before persistence succeeds. Missing images show an explanatory state while preserving
the rest of the work. Existing Questions and attempts remain accessible through migration.

Use visible labels, keyboard-operable controls, logical focus order and sufficiently
large touch targets. Statuses and awarded marks must not rely on colour alone. Announce
validation and save failures accessibly without repeatedly interrupting typing. Support
image descriptions, keyboard annotation notes, reduced motion and both themes. Sticky
controls must not cover answer fields when a mobile keyboard opens.

## 13. Review criteria and scope

The first implementation should be demonstrable with a biology set containing a shared
diagram and nested written parts, and a chemistry multiple-choice set. Authors can build,
preview and share them; learners can answer, resume, self-mark, annotate and inspect their
results. Links work in both directions, named exams provide context, and the path launches
the same practice flow. No part of that workflow requires a calibrated forecast.

Implementation validation must cover mark totals without double counting; partial and
unresolved marking; original versus corrected work; dependent-part answer exposure;
resume after leaving; concept links; unchanged card scheduling evidence; versioned
attempts after author edits; and export/import with diagrams and relationships intact.
Behaviour changes require the repository's red-to-green regression evidence, plus browser
checks of the author, learner, keyboard and mobile flows.

Every UI gate must include saved desktop and narrow-screen screenshots shared in the
chat. Capture the active task, not only the overview: authoring, answering and marking
must each demonstrate a clear primary action and secondary controls kept out of the way.
Label existing-interface baseline screenshots separately from newly implemented screens.

Jev and other automatic link classifiers are deferred beyond version one.
Classroom assignment collection, teacher marking queues, AI marking, freehand handwriting,
automatic paper extraction and grade-boundary predictions are outside this proposal.
Generated variants remain a secondary existing capability. This document defines proposed
product behaviour; it does not authorise unrelated implementation or claim that the combined
forecast has already been scientifically validated.
