# Question sets: research and design evidence

**Reviewed:** 26 September 2026

**Status:** Research and design proposals, not an implementation specification.

The [Questions design brief](questions-design-brief.md) consolidates the proposed product
and screen-by-screen UX. This note retains the supporting research and modelling rationale.

This note investigates self-marked, multipart exam questions connected to lessons,
concepts, cards and exam dates. It supplements the existing
[scientific assessment](scientific-assessment.md). Findings below distinguish published
evidence from proposed product decisions; Lacuna's complete workflow has not been validated.

## Learning science

### Self-marking should be a learning activity, not just a score entry

Andrade's 2019 review covers 76 empirical studies and distinguishes formative
self-assessment, used to improve work, from assigning oneself a final grade. It finds
encouraging evidence for formative approaches involving explicit criteria, feedback and
revision. This does not establish that learners' self-awarded marks are unbiased or match
an examiner's judgement. Interventions and outcome measures vary substantially.
[Andrade, 2019](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2019.00087/full).

A particularly relevant primary study involved 162 middle-school pupils. The treatment
combined a model essay, criteria generation and rubric-based assessment of drafts.
Pupils underlined rubric criteria, marked corresponding evidence in their own writing,
and noted needed improvements. The treatment was positively associated with writing
quality. This resembles the proposed annotation workflow, but the study was not a test
of annotation alone, nor of GCSE science questions: modelling, criteria and revision
were bundled, and the groups were not randomly assigned.
[Andrade, Du and Mycek, 2010, publisher abstract](https://www.tandfonline.com/doi/abs/10.1080/09695941003696172);
[author-uploaded full text](https://www.researchgate.net/publication/249001935_Rubric-referenced_self-assessment_and_middle_school_students%27_writing).

A 2025 meta-review of 28 reviews reinforces the importance of purpose, clear criteria,
modelling, instruction and practice, while warning that self-assessment research has
different aims and contexts. It is a critical synthesis, not a new pooled estimate of
the effect of clicking mark-scheme checkboxes.
[Nieminen and Boud, 2025](https://www.tandfonline.com/doi/abs/10.1080/0969594X.2025.2510211).

**Design inference:** ask learners to attempt a part before revealing its answer-specific
scheme, compare their response against the criteria, record marks, and optionally
annotate or correct it. Keep the original answer and first-attempt marks alongside later
corrections. Where the scheme has discrete points, recording which were earned gives
more useful evidence than a total alone. Support holistic rubrics too: not every essay
mark scheme can be flattened into independent checkboxes.

### Feedback is supported; one universally best timing is not

Butler and Roediger's experiment found that feedback after multiple-choice practice
improved later correct recall and reduced reproduction of misleading answer options,
compared with no feedback. Both feedback after each item and feedback after the test
helped. Their delayed feedback was still delivered within the session; this does not
justify leaving mistakes uncorrected for weeks.
[Butler and Roediger, 2008, author-hosted paper](https://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Butler-Roediger-2008_MemCog.pdf).

A more recent study with 41 second-year medical students found no significant difference
between post-item and post-block conceptual feedback on near/far transfer items,
including a one-week follow-up. Its small, specific sample limits generalisation.
[Ryan et al., 2024](https://doi.org/10.1111/medu.15287).

**Design inference:** practice can reveal feedback after a question; a paper-style
session can reveal it after submission. For dependent parts, revealing part (a)'s scheme
may disclose information needed for part (b). Record that exposure and avoid treating
the later answer as equivalent to an unaided first attempt. This is a measurement
safeguard, not a directly tested interface intervention.

### Recall and application are related, but cannot be collapsed into one score

Butler's four experiments found that repeated testing of prose material improved
performance a week later on both repeated questions and new inferential questions,
including questions in a different knowledge domain. Retrieval practice can therefore
support transfer; it is not limited to memorising an identical answer.
[Butler, 2010](https://pubmed.ncbi.nlm.nih.gov/20804289/).

An independent follow-up replicated the far-transfer advantage, but also found that
focused exposure to the key information could explain part of it. This limits claims
that retrieval alone reliably creates broad exam technique.
[van Eersel et al., 2016, university-hosted paper](https://repub.eur.nl/pub/98667/Frontiers-in-Psychology-Van-Eersel-et-al-2016.pdf).

**Design inference:** connect card recall and question performance through shared
concepts, while retaining separate observations. Add explicit skill links where useful
(for example, graph interpretation, evaluating evidence or constructing an explanation).
A learner can remember a definition yet fail to apply it. Conversely, a weak card result
and strong question performance do not prove the card is irrelevant. The two formats
provide different cues and demands.

Do not infer an error's cause from marks alone. Losing two marks could reflect missing
knowledge, misreading, an omitted unit, weak reasoning or uncertain self-marking.
An optional learner-selected reason can support reflection, but remains a self-report,
not an objectively diagnosed weakness. A concept link identifies relevance; it does not
prove that every linked concept was demonstrated or forgotten on that attempt.

Use previously unseen questions to check transfer as well as repeats to reinforce
learning. Repeatedly answering the same multipart question may partly measure memory
for that question and scheme. The precise mixture and schedule require evaluation.

### Exam-date links are defensible; optimal exam scheduling is unproven

Cepeda and colleagues studied more than 1,350 people learning facts, varying the gap
before review and the later test delay, which extended to a year. The useful spacing
interval depended on how long learning needed to last. This supports accounting for a
known assessment date. It does not establish an optimal algorithm for multipart
science questions, nor validate a specific countdown-based workload rule.
[Cepeda et al., 2008, author-hosted paper](https://laplab.ucsd.edu/articles/Cepeda%20et%20al%202008_psychsci.pdf).

**Design inference:** link a question set to an existing assessment/date and use its
scope and remaining time when planning practice. Preserve long-term history when the
exam passes. Question sets organise content and sessions; a set-wide memory state would
hide differences between its parts and concepts.

### FSRS predicts recall, not exam marks or exam technique

The official FSRS API defines retrievability as the predicted probability of correctly
recalling a card. The project's benchmark evaluates predictions against spaced-review
histories. These sources do not validate feeding self-awarded multipart question
percentages into FSRS, interpreting retrievability as exam marks, or updating several
cards from one question score.
[Official Python FSRS documentation](https://open-spaced-repetition.github.io/py-fsrs/);
[official scheduler benchmark](https://github.com/open-spaced-repetition/srs-benchmark).

The current repository already distinguishes question schedules from card schedules,
but declares a full-marks-to-Good, otherwise-Again mapping in
[question types](../src/questions/types.ts). The existing
[scientific assessment](scientific-assessment.md) already warns that predicted card
retrievability is not validated expected exam marks.

**Design inference:** preserve raw marks, available marks, question/part identity,
content version, assistance exposure and self-marking provenance independently of any
scheduling decision. Do not automatically alter a card's FSRS state because a linked
question was attempted. Any future conversion of marks into a question schedule is a
policy requiring calibration, not a scientific fact. Part-level records are essential,
but do not assume interdependent parts are independent memory items.

## Evidence limits and useful validation

The evidence supports the components: retrieval, feedback, criteria-based reflection,
revision and spacing. It does not directly validate this exact combination of linked
cards, multipart questions, annotations and FSRS scheduling.

A proportionate evaluation would compare a simple score-entry workflow with guided
criteria comparison and correction, measuring later performance on unseen but related
questions. Include an independently marked sample to assess self-marking agreement.
Measure completion time and abandonment as well as learning: compulsory reflection on
every easy item could add friction without a corresponding benefit. Keep recall,
application performance and marking agreement as separate outcomes.

## Competitor evidence

These are documented capabilities from first-party public pages, checked on 26 September 2026. No signed-in product walkthrough was performed. Absence from these pages does not prove a competitor lacks a feature.

| Product | Verified overlap | Relevance to Lacuna |
| --- | --- | --- |
| Save My Exams | Topic-organised exam questions, mark schemes, self-marking, multiple-choice and written formats; its guide explicitly describes attempting then revealing and reviewing the answer. | Closest documented match to the requested self-marking flow. |
| Cognito | Lessons and notes, quizzes, flashcards, exam-style questions and past papers; advertises AI marking. | Shows demand for recall and exam practice in the same product. |
| Diagnostic Questions | Teacher creation/sharing of questions and quizzes; wrong options designed to expose particular misconceptions. | Relevant to chemistry MCQ authoring and diagnostic distractors. |
| RemNote | Exam dates associated with study material and a flashcard schedule adjusted around those dates. | Relevant precedent for linking study activity to an assessment deadline. |
| Physics & Maths Tutor | Subject/board past papers with mark schemes, plus chemistry topic question packs and model answers. | Useful reference for authentic paper structure and source material presentation. |

Sources: [Save My Exams](https://www.savemyexams.com/learning-hub/sme-articles/how-to-use-exam-questions/), [Cognito](https://www.cognito.org/), [Diagnostic Questions](https://diagnosticquestions.com/Home/Questions), [RemNote](https://help.remnote.com/en/articles/9101991-preparing-for-an-exam), [PMT papers](https://www.physicsandmathstutor.com/past-papers/), [PMT chemistry topic example](https://www.physicsandmathstutor.com/chemistry-revision/a-level-ocr-a/module-5/how-far-video-solutions/).

No reviewed documentation establishes the complete combination of teacher-authored nested papers, self-marking annotations, atomic-concept links to cards, separate recall/application evidence and deadline-aware practice. This is a limited finding, not a market-wide novelty claim.

## Jev assessment

**Scope decision:** exclude Jev from version one. Authors manually search and select
concept/card links. The findings below are retained as research for possible later
evaluation, not an integration requirement.

TypeSafe's official model reference lists Jev 1.13 (`jev-1.13.0`) at **US$0.042 per million input tokens**, with output free. Input is text only: it cannot directly read diagrams, handwriting, audio or video. Pinning a version avoids the behavioural drift of the latest alias. [Model reference](https://docs.typesafe.ai/models).

Jev returns choices, rubric scores or truth probabilities rather than generated prose. A request can evaluate several specified questions against shared state. [Introduction](https://docs.typesafe.ai/introduction). Its provider's no-hallucination claim concerns constrained/schema-correct output, not guaranteed factual decisions. [Launch explanation](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

Illustrative inference cost: 10,000 requests at 2,000 total input tokens each consume 20 million tokens, costing **US$0.84** at the direct published rate. This is arithmetic, not a measured Lacuna workload; extraction, retries, hosting and other models are additional.

An independent preprint submitted on 24 September compares Jev with three flash-tier LLM judges across nine panels. Results are more encouraging for binary checklists than graded judgements; confident errors are often shared by the other models, so escalation is not a guarantee of correction. Cost comparisons depend on the study's batching and per-criterion LLM calls. This very recent preprint is not validation of GCSE/A-level self-marking or of Lacuna's intended tasks. [Rao and Callison-Burch, 2026](https://arxiv.org/abs/2609.29769).

**Potential future use:** suggest question-to-concept/card links during authoring, not mark student answers. Keep suggested links reviewable. The learner remains responsible for self-marking. For multiple relevant concepts, evaluate relevance independently rather than forcing a single winning label. Include unknown/not-enough-evidence outcomes. Do not let a classifier directly alter card FSRS states or diagnose why a student failed.

The first useful experiment would use held-out, teacher-labelled question-to-concept relationships spanning subjects, paraphrases, prerequisites and ambiguous cases. Measure link precision/recall, missed prerequisites and confidence calibration. Compare with simpler existing search/retrieval. Keep authoring, answering and self-marking usable without paid inference. No paid calls were made for this research.

## Fit with the existing repository

Inspected on 26 September 2026:

- `src/db/types.ts`: cards already have a canonical `conceptId`; dated final/checkpoint assessments have stable IDs, lesson coverage and path anchors. Existing practice nodes select cards.
- `src/questions/types.ts`: questions already have independent schedule states and immutable presentation/attempt records; concept relationships are arrays but explicitly limited to one target in the current version.
- `src/questions/selection.ts`: current practice selection requires exactly one target concept and does not consult the card pool.
- `src/questions/grading.ts`: currently maps full marks to Good and any valid partial result to Again, withholding disputed or undetermined evidence.
- `src/questions/scheduler.ts`: applies question grades without reading or writing card state.
- `src/pages/QuestionEditor.tsx`, `src/items/types.ts`: current formats are numeric and checked working; the editor uses the existing image-capable Markdown editor.
- `src/course/assessmentPractice.ts` and `src/fsrs/examDate.ts`: assessment-aware practice and date resolution exist for cards.

These are reusable foundations, not evidence that richer question sets already exist.

## Proposed product shape — not an implementation commitment

### Structure and links

A set contains ordered questions. A question can have shared source material and nested parts: Q1 → (a) → (i)/(ii). Each answerable part owns its answer, mark scheme and maximum marks. Group totals derive from scored children so marks are not counted twice; a stem may carry context without being separately answerable. Preserve dependencies between parts when selecting practice.

Connect sets to existing assessment IDs and lesson IDs rather than copying dates into every question. A set may serve more than one assessment. Moving an exam should change practice planning without changing historical marks. Do not promise predicted exam scores from practice percentages.

Use the existing concept identities for card ↔ concept ↔ question-part navigation. Parts can target several concepts; authors allocate marks to the relevant concepts and skills through the marking criteria described below. The UI should expose actual related cards and questions in both directions. A concept link records relevance; it does not prove each linked concept was successfully recalled on an attempt.

Distinguish knowledge, application/reasoning and exam execution. AQA GCSE Biology explicitly distinguishes knowledge/understanding (AO1), application (AO2) and analysis/evaluation (AO3); these are assessment categories, not independent latent abilities proved by a score. [AQA assessment objectives](https://www.aqa.org.uk/subjects/biology/gcse/biology-8461/specification/scheme-of-assessment).

### Authoring and study

Authoring starts with the paper: set title, question text, images, add part/subpart, mark scheme and marks. Let authors preview the learner's view. Put concept, lesson and assessment links near the relevant content without making the initial screen a metadata form.

Student flow: open a Practice Qs path activity → see shared context and diagrams → answer in a generous expanding field → submit the original response → reveal the mark scheme → annotate the response and award marks → record an optional reason for lost marks → save. Keep original work separate from later annotations and corrections. Support an unsure marking state rather than forcing false precision.

Criteria may support evidence highlighting, but not every mark scheme is a checklist. Preserve prose/level-based schemes, alternatives and dependencies. Confirm maximum marks without inventing an automatic rule for holistic judgements.

### Author-defined mark allocations and student judgement

**Confirmed design requirement:** the teacher or author chooses what each allocation of
marks assesses. The student judges their own response against those allocations;
Lacuna calculates the totals and uses the resulting evidence in the exam-day forecast.
Concept/card links are selected manually in version one. Jev is deferred and would
only suggest links if introduced later; it would not award marks.

For each answerable part, the author supplies marking criteria, the marks available
for each criterion, and its assessment dimension: **knowledge**, **application/reasoning**
or **exam execution**. Knowledge criteria link to one or more atomic concepts and hence
their cards; the other criteria link to the relevant skills and any required concepts.
These product dimensions do not automatically correspond to an exam board's AO labels.

For example, an author could allocate a six-mark part as follows:

| Criterion | Dimension | Available marks |
| --- | --- | --- |
| State the relevant scientific relationship | Knowledge | 2 |
| Apply that relationship to the supplied data | Application/reasoning | 3 |
| Include the comparison required by the command word | Exam execution | 1 |

This is an illustrative author-defined scheme, not a prescribed split for all questions.
Allocation totals must equal the part's maximum. Each available mark contributes once
to the overall total: multiple concept links do not multiply its value. If a criterion
spans dimensions, the author explicitly divides its mark allocation rather than assigning
its full value to every dimension. Preserve holistic or level-based judgement within
an allocation where the scheme requires it; do not invent separate marks absent from
the source scheme. An unsplit mixed allocation can contribute to the overall result
without pretending to provide separate evidence for each dimension.

After submitting an answer, the student sees these criteria beside their original work,
annotates the evidence and awards marks within each allocation's permitted range.
Discrete points can be ticked; allocations permitting partial credit accept a mark value.
An unsure or unmarked allocation remains unresolved rather than silently becoming zero
or full marks. Show any subtotal as provisional until marking is complete. Save the
awarded marks, annotations and scheme version with the attempt; later author edits or
student corrections must not overwrite the original evidence.

The completed attempt shows its total and separate knowledge, application/reasoning
and exam-execution results. These describe where marks were awarded under the author's
scheme. They do not prove why a mark was lost; optional error reasons remain separate.

Self-reported reasons may include forgotten knowledge, difficulty applying an idea, misread command, missing evidence, units/calculation, time, and unsure. Permit overlapping causes; do not force every mistake into knowledge versus technique.

### Evidence and scheduling

Keep card review history, question attempt history and self-reported error reasons separate. Record assistance/answer reveal and question revision context; later editing must not rewrite what was originally attempted.

Display recall evidence alongside question marks and skill/error trends, with sample size and self-marked provenance. Avoid duplicating the full marks of a multi-concept part into several independent concept scores. A weak result can recommend related cards, but cannot manufacture failed reviews for those cards.

Retain historical question schedules during any future migration. New multipart scheduling needs an explicit policy: related parts are not necessarily independent and aggregate marks are not FSRS recall grades. An exam-date-aware practice planner can select suitable questions without claiming that its selection is a validated memory probability.

Scope remains teacher authoring/sharing and independent learner practice. Classroom assignment collection and automatic marking are not required.

## Integrating exam-day performance — follow-up proposal

The prompter clarified that any future Jev integration would link questions to cards,
not mark answers, and subsequently excluded it from version one. Manual links provide
the same relationships needed to make exam-day performance more useful than a standalone
question bank.

### Correct the interpretation of the existing signal

`src/fsrs/progress.ts` computes average projected card retrievability. `src/fsrs/objective.ts` labels this “Predicted exam score”. The existing scientific assessment already identifies this as an unvalidated interpretation. A richer question system can supply the missing observations, but a new label or arbitrary blend cannot itself validate an exam prediction.

### A shared forecast with separate evidence

1. **Assessment scope:** reuse the named exam, date, lesson coverage and any authored paper/topic/skill mark distribution. A question bank's number of questions is not the exam's topic weighting.
2. **Knowledge evidence:** use card recall projections at that exact exam date, grouped through existing concepts/scheduling identities. Several cards covering the same knowledge are not independent chances to earn extra marks. Missing cards mean unknown coverage, not zero knowledge.
3. **Question evidence:** use first-attempt self-marked allocations for knowledge, application/reasoning and exam execution, distinguishing difficulty, skill demand, unseen/repeated questions, assistance and timing conditions. Preserve partial marks; parent totals must not duplicate child evidence.
4. **Forecast:** predict expected marks for the author's allocations using projected recall and the relevant question evidence jointly, then sum them into question and assessment estimates. A knowledge mark observed in a question and a related card's recall projection inform the same forecast; they are not two marks to add together. Unsplit mixed allocations receive one combined prediction.
5. **Aggregation:** aggregate expected part scores using the assessment's representative blueprint. Expected scores can be summed without assuming independent parts, but uncertainty estimates and prerequisite effects must account for dependencies. Without a representative blueprint, label the output as performance on covered practice material, not a whole-exam score.

Proposed statistical shape: expected part marks conditional on projected concept recall, observed relevant skill performance, question difficulty and attempt context. These are candidate explanatory inputs, not a validated formula. Do not multiply every linked concept probability, average recall and marks 50:50, or invent numerical coefficients without calibration.

The intended output is a combined **estimated exam score**, with its knowledge,
application/reasoning and exam-execution contributions inspectable. Its three evidence
inputs remain projected card recall, self-marked question performance and the assessment's
coverage/mark distribution. The author's allocations determine what marks are available
for each demand; they do not prescribe arbitrary statistical weights between recall and
question history. Calculate a completed practice score directly from awarded marks;
calculate the future exam estimate through the separate forecast model. Retain the
uncertainty, coverage and calibration requirements below rather than presenting those
two scores as equally certain.

Knowledge-component modelling has precedent: Carnegie Mellon's DataShop documentation describes associating several components with one activity and evaluating learning/performance models; Performance Factors Analysis models outcomes using skill difficulty and successful/unsuccessful practice. Neither validates this proposed combination with FSRS or self-marked science papers. [CMU concepts](https://www.cmu.edu/datalab/getting-started/key-concepts.html), [Pavlik, Cen and Koedinger, 2009](https://files.eric.ed.gov/fulltext/ED506305.pdf).

### Useful integration before a calibrated mark forecast

Show knowledge retention, application evidence and coverage alongside the next recommended action for a named assessment. Examples are proposed UI behaviour, not measured results:

- Weak projected recall plus weak linked answers: suggest the relevant card review followed by a fresh question.
- Strong projected recall but weak application: suggest a new question testing the same reasoning skill, not another round of every related card.
- Strong results only on repeated questions: suggest an unseen check before showing strong readiness.
- No question evidence for an assessed skill: identify the coverage gap and offer practice.

This creates an actionable feedback loop without claiming the system knows the cause of every lost mark. Strong card evidence plus weak question evidence is a discrepancy to investigate, not proof that technique alone is at fault.

For any future numeric exam forecast, show uncertainty and coverage, retain self-marked provenance, and validate against later unseen timed questions and independently marked samples. Hold out learners, questions/families and later time periods as appropriate; avoid training on a corrected answer then calling its original mark a successful prediction. Compare with simpler recall-only and recent-question-average baselines. Future planned practice is a scenario, not an observed improvement; display whether a projection assumes no further study or completion of a specified plan.

### Deferred: Jev's possible linking role

This is a future research option. Version one establishes these links manually and
includes no classifier calls or suggestion interface.

Provide the question part, mark scheme and candidate concept definitions/card examples to Jev. Ask independently which concepts are required, merely contextual or absent; several may be relevant. Approve the suggested links in authoring. For diagram-dependent questions, supply a verified textual description or use a separate extraction step because Jev is text-only.

Use the approved links both ways: a card can show the exam questions it supports, and a question can show the cards covering its prerequisites. Let the forecast consume those same links. Jev confidence measures a linking judgement, not the student's knowledge and not their probability of earning a mark.

A later planner could compare the estimated benefit per minute of card review and question practice. Initially use explicit recommendation rules; causal learning gains from question practice have not been fitted, so do not claim an optimal marks-per-minute allocator.
