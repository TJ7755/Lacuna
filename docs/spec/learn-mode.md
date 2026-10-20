# Study contract

Start at [LearnMode](../../src/pages/LearnMode.tsx), [useLearnSession](../../src/pages/learn/useLearnSession.ts)
and [session](../../src/fsrs/session.ts). Their tests own selection examples, control labels,
shortcut bindings and transition timings. The boundaries below explain what changes must preserve.

## Session lifecycle

Session progress measures completion of admitted work, not predicted recall. A retry falling due
must not move completed progress backwards. Course continuation recomputes from authoritative
state after each step instead of persisting an obsolete plan of future steps.

Prepare the current presentation without waiting for later images. Lookahead must not mutate the
active engine's random state, queue or review evidence. Failed or cancelled preload work cannot
stop study. A Card has one shared FSRS state even when linked into several Lessons.

Leaving active work uses a deliberate confirmation; Stay preserves the mounted presentation.
Overlays own keyboard input and cancel an uncommitted grade. Their dismissal and the next
presentation restore useful focus without stealing a control deliberately selected during a save.
A cancelled departure must not abandon a receipt or manufacture another attempt.

## Card selection and grading

Objective ordering, cooldown, due-only review and assessment revision are separate policies.
Keep their boundaries explicit; due-only must respect saved due times and cannot introduce new
Cards. Availability and denominator rules are in [eligibility](eligibility.md).

Today and Study share a course-wide pool of scheduled reviews due now. Lesson locks,
introductions and predicted exam readiness cannot hide those reviews. Without a future exam,
future scheduled Cards are held until due; optional exam practice admits only Cards below their
applicable future exam target and is never labelled as due work.

The timer captures recall time when the answer is revealed or submitted. Thinking during marking
and editing must not inflate it. Incorrect answers, inferred grades and manual grades use the
same real FSRS transition. Hint penalties apply at the answer boundary, without contaminating the
correct-response timing calibration. The actual thresholds live in
[grading](../../src/fsrs/grading.ts), not a copied table here.

### Recording a review

Persist scheduling, canonical review evidence and the associated state atomically. Submission
identity prevents replay from applying the same answer twice. Undo restores the corresponding
state rather than inventing a compensating review. Preserve captured timing, hint, primed and
line-verdict evidence through history conversion and exports. Daily trajectory sampling runs
after commit and cannot turn a successful review into a reported failure.

## Structured-item verification

[verify](../../src/items/verify.ts) is a pure offline checker. Expressions are restricted data,
not executable scripts. Random numerical agreement is not symbolic proof; insufficient valid
samples are undetermined, never silently correct. Preserve the raw result when disputed and
withhold inappropriate evidence rather than manufacturing awarded marks.

Unknown future payloads remain readable through their fallback content but cannot be submitted,
revealed for grading or marked through stale keyboard/caller paths. Enforce that at the central
answer boundary as well as the visible face.

### Numeric Question face

Numeric answer specifications must evaluate to finite real constants. Authoring and import
validate the same grammar. Variable-bearing formulae require an appropriately checked Working
item rather than a numeric item that can never accept its intended answer.

Questions retain their immutable first submission and mandatory worked feedback. Corrections are
separate. Question evidence never writes Card history or FSRS state.

## Working Questions and Question Sets

A saved Working Question must have a meaningful passing fixture and a valid scheme. Generated
practice uses versioned built-in families, not arbitrary executable generator code. AI staging
reuses the existing validated repository transaction when accepted; it is not another persistence
model. Repairing one staged item preserves the other decisions.

Question Set attempts wait for saves before advancing, protect dirty responses/notes/corrections
and require an explicit learner marking decision. An unreadable attempt is unscored rather than
hidden or reported as zero. Immutable content/scheme receipts and conflicts are covered by
[data ownership](data-model.md).

## Assessment revision

Named revision requires an explicit assessment identity. Replanning preserves completed days;
expired plans become historical evidence. Allocator model failures use an explicit ordinary
Practice fallback. Revision reviews retain provenance and must not create curricular Practice
milestones. The short-term model's corpus is external; its benchmark is not evidence about
Lacuna learners. See [revisionPlan](../../src/course/revisionPlan.ts) and
[cramAllocator](../../src/fsrs/cramAllocator.ts).

## Simple Learn and recitation

Simple Learn is algorithm-free: its progress/resumption data does not update FSRS, readiness or
daily review limits. Leaving or reloading retains an unfinished session; only completion clears it.
Suspended/buried Cards and archived Courses retain their normal exclusions.

Recitation is explicitly self-marked whether typed or spoken. Typing a matching answer does not
skip marking. Speaker cues belong to the learner line they introduce. A final joined check grades
the relevant line through the normal undoable answer path; recitation timing is excluded from
speed calibration. Content, marks and position must survive chunk changes and narrow layouts.

[Specification index](../SPEC.md)
