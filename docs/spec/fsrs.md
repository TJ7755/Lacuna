# Scheduling model boundaries

Exam-day projections and named assessment revision are additional layers, not replacements for
the real review transition. The short-term predictor's validity and transfer limits belong to its
[benchmark](../../tooling/short-term-memory/BENCHMARK.md); an invalid or unsupported prediction
uses the explicit ordinary-Practice fallback instead of inventing confidence.

Time semantics must be established from the current wrapper, horizon and training code. The
previous proposal for a configurable global study-day clock was deferred, not delivered.

## Several dated papers

Paper definitions travel with their Course rather than an application-bundled syllabus. Concepts
retain the specification-point links; Cards inherit coverage through their Concept. Paper coverage
is independent of lesson order, while exposure and lesson access still govern practice eligibility.

Keep exactly one final assessment, dated at the last paper. Earlier papers are checkpoints. For a
Card without an explicit lesson date override, target the earliest upcoming assessment that covers
it. After that paper passes, use its next applicable paper. A specification-scoped final is not a
fallback date for unrelated Cards. Passing an earlier paper does not end the Course.
After a Card's last applicable paper, the existing ordinary-retention horizon applies even if
another paper remains for other material. A session explicitly revising one assessment keeps that
assessment's own horizon.

These dates change the prediction horizon, not the underlying review evidence: overlapping papers
share the same Card and FSRS history. Earliest-paper targeting is a product heuristic, not a claim
of optimal allocation across examinations. Predicted recall does not estimate marks, grades or
independent application. Existing short-term projection validity checks and ordinary-Practice
fallbacks continue to apply.

## One Study conductor

The Course's Study action recommends one current activity; optional ways to study remain in its
preview disclosure. Named assessments define dates and coverage. They do not launch a separate
revision-plan setup or require daily windows. Existing saved revision plans remain portable history.
No timetable or assumed next visit is required: future recall is projected at the applicable exam,
and available early practice is permitted even before an ordinary review becomes due.

The conductor replans at activity boundaries. A ten-review block is an operational hand-off to
notes or independent questions, not a daily allowance, mastery threshold or completed milestone.
Unfinished question attempts resume before new work. Reliable knowledge gaps can lead to lesson
notes and then an independent question; attributable application or technique gaps prioritise
fresh matching questions. Due recall and assessment preparation otherwise alternate with available
question or lesson work. Exhausted question pools remain explicit; familiar questions are an
optional choice rather than fresh assessment evidence.

This ordering is an engineering policy informed by retrieval practice and spaced learning. It is
not a scientifically proven optimal allocator. Jev's criterion diagnostics are uncertain evidence
in that Concept context, not global skill mastery. Question marks and diagnostics never manufacture
Card reviews or FSRS transitions. Publisher editing locks do not alter learner access rules;
question targets and prerequisites must stay within the accessible knowledge scope.

## Progress measures

The course Progress page reads one report for the whole course or one selected assessment
([courseProgress](../../src/course/courseProgress.ts)). Every figure counts the same Cards: those
in scope, outside extension lessons and not suspended or buried; excluded Cards are stated. Studied
coverage partitions them into reviewed, taught or introduced but unreviewed (a lesson exposure or a
learner-declared school lesson), and not started. Exposure is never counted as recall.

Predicted recall uses the Course objective with no further reviews; unreviewed Cards count as 0.
A selected assessment is measured at its own date, as in the Study hand-off. The whole course
measures each Card at its applicable paper, as the course summary does, so it has no single date
and the exam-day chart appears only when every counted Card shares one. Passed, undated and empty
scopes show no forecast. Lesson rows partition the same pool by primary lesson, with an "Other
cards" row for Cards linked in from elsewhere or without a lesson, and use the same date, so their
card-weighted mean equals the headline; a lesson without counted Cards has no figure. Question evidence remains separate and course-wide.
