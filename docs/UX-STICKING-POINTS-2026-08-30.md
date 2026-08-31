# UX/UI sticking points — audit and prioritisation

Date: 30 August 2026. Scope: code at commit `3e3ec76`.

## Delivery status

Implemented on 30–31 August 2026: QW-1–QW-10, EH-1, EH-2 and EH-4. The Course-facing terminology
pass changed the two confirmed live strings in this scope; the other three reported strings
were compatibility/import wording or had already moved. QW-7 added a persisted steady-retention
target across assessments, scheduling units, backup and sharing rather than merely making one form
field nullable. EH-2 now guards every live Card and Question exit and resumes interrupted Simple
sessions. EH-4 extends the existing draft system across the complete Question authoring state. The
remaining EH, IM and LG findings remain roadmap work.

The 31 August follow-up removed the stale Undo action from answers that have already finalised a
session and restored batch-revision focus to **Accept all clean** when successful revisions remove
their trigger. Ordinary in-session answers retain both the visible Undo action and `U` shortcut.

## How this was produced

Three parallel audits were run over (a) the core study surfaces (`LearnMode`,
`QuestionLearnMode`, `CourseStudyFlow`, `LessonView` and the `learn` components), (b) the
management and authoring surfaces (Dashboard, CoursePath, Cards/Card/Question editors,
Settings, Share, Search) and (c) the project's own records (BROWSER_QA_AUDIT, UX-MAP,
MANUAL_WALKTHROUGH, terminology audit, next_plan). The highest-severity claims were then
verified directly against the source; all evidence below cites files and lines.

Every finding is rated on two axes:

- **Essential?** — does it block or actively damage the core loop of study, authoring, or
  trust in a local-first app? _Essential_, _Important_, _Optional_.
- **Effort** — _small_ (hours, localised change), _medium_ (a focused arc), _large_
  (information-architecture or cross-surface work).

The general picture: the single-card study surface is unusually polished; the friction
concentrates in (1) the grading feedback loop, (2) unforgiving session and authoring
boundaries, (3) first-run and data-movement journeys, and (4) drift between acknowledged
intent and shipped state.

## Priority matrix

This matrix records the priorities at the time of the audit. QW-1–QW-10 are now delivered, as
recorded above; the EH, IM and LG rows remain roadmap work.

### Easiest AND essential — do these first

| #     | Finding                                                                   | Effort       |
| ----- | ------------------------------------------------------------------------- | ------------ |
| QW-1  | Restore points report wrong "N lessons" count on a safety surface         | small        |
| QW-2  | Failed Question start leaves an endless skeleton with no exit             | small        |
| QW-3  | "Continue" on the study-flow transition can silently do nothing           | small        |
| QW-4  | Card-editor autosave fabricates phantom drafts and can destroy a real one | small        |
| QW-5  | Question working input locks the moment it is checked — no "edit answer"  | small        |
| QW-6  | Expose learn-mode undo as a control, not a hidden keyboard shortcut       | small        |
| QW-7  | Exam date is a hard gate with a silently invented 7-day default           | small–medium |
| QW-8  | Landing-page CTAs read as disabled/decorative in the light theme          | small        |
| QW-9  | Five user-facing "deck" strings on Course-facing screens                  | small        |
| QW-10 | Learn-mode screen-reader announcements drown card content                 | small        |

### Essential but heavier — schedule as arcs

| #    | Finding                                                                        | Effort |
| ---- | ------------------------------------------------------------------------------ | ------ |
| EH-1 | Silent grading: the learner never learns what the scheduler decided            | medium |
| EH-2 | Exit is instant, unconfirmed and unrecoverable mid-session                     | medium |
| EH-3 | Search routes to editors; note hits dead-end                                   | medium |
| EH-4 | Question editor silently discards unsaved work                                 | medium |
| EH-5 | Study entry-point consolidation (UX-MAP R-01, P0) recorded but never delivered | medium |
| EH-6 | Destructive actions lack one confirm-and-undo standard (R-12 remainder)        | medium |

### Important, moderate effort

| #     | Finding                                                                           | Effort       |
| ----- | --------------------------------------------------------------------------------- | ------------ |
| IM-1  | Checker disputes are collected, then go nowhere — and disputing costs the learner | medium       |
| IM-2  | Hint penalty invisible at the point of use                                        | small        |
| IM-3  | Scheduler internals leak onto learner surfaces (Stability / Leech badges)         | small        |
| IM-4  | Question deletion is unrecoverable where course deletion is not                   | small–medium |
| IM-5  | Empty course path dead-ends non-authors; authoring hint is desktop-only           | small        |
| IM-6  | Focus-mode exit depends on hover; no touch affordance or first-use hint           | small        |
| IM-7  | Denied browser permissions leave no recovery path                                 | small–medium |
| IM-8  | Course settings commit instantly with inconsistent commitment models              | medium       |
| IM-9  | Global analytics speaks scheduler jargon to non-technical learners                | medium       |
| IM-10 | Share page offers near-identical verbs in internal terms                          | medium       |
| IM-11 | "Undo scheduling" ghost button sits beside "Next Question" on every question      | small        |

### Optional / larger arcs — deliberate roadmap items, not defects

| #    | Finding                                                                              | Effort                       |
| ---- | ------------------------------------------------------------------------------------ | ---------------------------- |
| LG-1 | Payload flows (publish, import, backup, sync) have no single data centre (R-03, P0)  | large                        |
| LG-2 | Item families sit outside the course path (R-05)                                     | large                        |
| LG-3 | Course-level vs global settings: no inherited/overridden indicator                   | large (intermediate: medium) |
| LG-4 | AI trust flow (pairing, permissions, revocation) not consolidated (R-11)             | medium                       |
| LG-5 | Electron update state invisible (R-14)                                               | small                        |
| LG-6 | Dashboard sort configured in global Settings, not on the dashboard                   | small                        |
| LG-7 | Sequence preview keeps wrong terminology after a type change                         | small                        |
| LG-8 | Question practice lags the card surface (keyboard, undo, progress, exit conventions) | medium–large                 |

## The findings in detail

Each heading records the position at the audit commit; the Delivery status section above states
what has since shipped. QW-1 and QW-9, the two findings whose detail sections read most like a
current defect report, carry explicit delivered labels below.

### QW-1 — Restore points report a wrong lesson count (essential, small; fixed 30 August 2026)

`BackupsSection.tsx` renders `{backup.deckCount} lessons`, but `takeAutoBackup` derives the
count from `payload.decks.length` — legacy backing Deck rows, not Course lessons. The learner
is deciding whether to trust a restore point with a destructive replace import while reading a
count that can be simply wrong. Accuracy on a safety surface is non-negotiable. Fix: count
lessons from the payload's course/lesson structure.

### QW-2 — Failed Question start strands the learner on an endless skeleton (essential, small)

`QuestionLearnMode.tsx:88-103` handles a start failure with a toast only; `attempt` stays
`null` and lines 230-231 render a pulsing placeholder forever. No retry, no exit beyond the
small header link. A dead end in the primary practice loop is the worst class of stuck state.
Fix: render an inline error card with Retry and Exit when start fails.

### QW-3 — "Continue" on the study-flow transition can silently do nothing (essential, small)

`CourseStudyFlow.tsx:188-205`: `continueFlow` returns without effect when
`flow?.generation !== refreshKey`, so clicking Continue occasionally does nothing — no
navigation, no disabled state, no pending indication. A primary button that ignores clicks
reads as a broken app and trains double-clicking. Fix: disable with a pending state until the
planner generation matches.

### QW-4 — Card-editor autosave fabricates drafts and can destroy a real one (essential, small)

`CardEditor.tsx:259-300` has no dirty tracking: the autosave fires on mount and writes a draft
byte-identical to the stored card, so "A saved draft was found" appears on essentially every
card ever opened — training users to dismiss the banner. Worse, when a genuine draft exists
the form mounts blank (seeding skipped, lines 185-208) and the autosave still arms, so roughly
800 ms after opening the editor the real draft content is overwritten with a blank form.
Silent destruction of authoring work is the most damaging class of defect in a local-first
tool. Fix: gate autosave on actual user modification after seeding, and never arm the timer
while the draft prompt is pending.

### QW-5 — Working input locks the moment it is checked (essential, small)

In the Question study panel (`WorkingStudyFace.tsx` / `QuestionResponsePanel.tsx`), pressing
Check — or Enter on the auto-focused textarea — freezes the input. A learner who spots a typo
can only submit the flawed working or dispute the checker for their own slip. There is no
"edit answer" control. Fix: an "Edit answer" button that clears `checked`; the checker is
deterministic given the seed, so re-checking is safe.

### QW-6 — Undo is a hidden, single-shot keyboard shortcut (essential, small)

The only trigger for `undoLast` in the learn surface is the `U` key
(`useLearnKeyboardShortcuts.ts:149-151`); no button, menu entry or touch control exposes it.
`lastAnswer` is a single ref, so after the next answer a mis-grade is permanently in the FSRS
history — a false observation no later review can distinguish from honest data. The repository
already supports reversal (`undoReview`, `repository.ts:1162`) and the hook already computes
`canUndo`; the gap is purely exposure. Fix: surface undo as a brief post-answer toast button
or a menu entry. (Multi-level undo is a separate, larger improvement.)

### QW-7 — Exam date is a hard gate with a silently invented default (essential, small–medium; fixed 31 August 2026)

`NewCourseForm.tsx` requires an exam date (lines 41, 58-64, 203-214); `datetime.ts:14`
defaults to creation + 7 days; there is no "no exam" escape. A self-study learner, or a teacher
building material with no sitting date, must fabricate a date — and the fabricated date then
drives urgency pills and pacing that can be actively wrong. The first thing a new user does is
the thing the app handles least gracefully. Fix: make the date optional with an explicit
"steady long-term retention" mode, and stop anchoring the course header on a date that may not
exist.

Delivered: Course creation requires an explicit exam/steady choice; steady final assessments carry
no fabricated date; settings can switch the target; scheduler, Course headers, backups and share
codes preserve the distinction. Dated checkpoints remain available in either mode.

### QW-8 — Landing-page CTAs read as disabled or decorative (essential, small)

MANUAL_WALKTHROUGH_2026-08-09 records (still open) that in the light theme "Create your first
course" is low-contrast orange on pale orange and "looks disabled", while "Try one card first"
and "Import Anki / JSON" are fainter still and read as decorative labels. This is the
first-run drop-off point. Fix: contrast pass on the Welcome primary actions.

### QW-9 — Five user-facing "deck" strings survive on Course-facing screens (essential, small; fixed 30 August 2026)

Recorded in `docs/course-terminology-audit.md` and confirmed still open by the UX-MAP R-07
delivery scope: the new-card cap copy ("a large deck does not overwhelm you",
`SchedulingFieldsSection.tsx:122`), the review-cap copy, the duplicate-card warning, the
legacy import preview, and the "Shared deck" fallback name. Every "deck" on a Course screen
teaches a noun the product no longer uses. Fix: five copy edits plus test assertions.

### QW-10 — Screen-reader announcements drown card content (essential, small)

`LearnHeader.tsx:392, 412-414`: an `aria-live="polite"` span announces the full tally ("N
correct, N wrong, N current, N unseen") after every single card, on top of the card content.
Well-meant accessibility that makes the core loop materially worse for its target users.
Fix: announce "card X of Y" or just the recorded outcome.

### EH-1 — Silent grading is a black box end to end (essential, medium)

A learner answers Yes and the next card appears instantly. An invisible response timer
converted that Yes into an internal FSRS grade; the learner discovers grades they never gave
only in the session report. Nothing on the answer screen, in KeyHints, or in the button copy
says speed is being judged — a distracted ten-second Yes is silently graded Hard. On top of
that, hint use adds a hidden 1.5 s penalty (`useLearnSession.ts:1370-1374`,
`grading.ts:33`) disclosed nowhere at the point of use. This is the product's core loop, and
its most important feedback link is opaque. Fix: a brief post-answer confirmation ("Good ·
again in 4 days"), a one-time statement that timing matters, and a one-line disclosure when a
hint step is revealed. No change to the grading logic itself.

### EH-2 — Exit is instant, unconfirmed and unrecoverable (essential, medium; fixed 31 August 2026)

`useLearnSession.ts:417-419` navigates away immediately on `backOut`; `LearnMode.tsx:472`
wires Exit to it mid-session; `QuestionLearnMode.tsx:159-165` abandons the attempt and
discards any half-typed answer. Answered cards persist individually, but the session queue,
in-flight card and typed answers are lost without warning — and browser back gestures and
pocket taps make accidental exits routine. Fix: confirm-on-exit when work is outstanding
("3 of 10 cards answered — exit anyway?"), and persist simple-mode queue position for resume.

### EH-3 — Search is an authoring trapdoor (essential, medium)

`SearchPage.tsx:294` routes card hits to `cardEditPath` and question hits to the question
editor; worse, note hits (lines 39-46) deep-link to the lesson page without opening or
scrolling to the note. A learner searching for content lands in a full editor with Save/Cancel
— a context they did not ask for — and note hits are a genuine dead end. Fix: view-first
results with edit as a secondary action; a real note deep link.

### EH-4 — The Question editor silently discards unsaved work (essential, medium; fixed 31 August 2026)

`QuestionEditor.tsx` has no draft persistence (no `saveDraft`/`loadDraft`), no `beforeunload`
guard and no dirty check on its back link (lines 218-224). The fields at risk are the
densest authoring surfaces in the app: long-form prompt, mark scheme, worked explanation.
The identical gesture is recoverable in CardEditor (drafts via `utils/drafts.ts`), so the app
teaches contradictory mental models: leaving the card editor is safe, leaving the question
editor is fatal. Fix: extend the existing drafts mechanism plus a dirty-state navigation
guard. (A guard alone is small effort but weaker — it protects navigation, not a crash or
refresh.)

### EH-5 — Study entry-point consolidation recorded but never delivered (essential, medium)

`docs/UX-MAP.json` R-01 ("Make Study the single primary learning entry point", P0) has no
delivery record, unlike R-02 and others; gap G-04 ("Study, Practice Now and Review today
overlap") scores 5/10 with contradictory status. The learner sees competing doors into the
same loop with no single obvious action. Note the drift: `next_plan.md` marks UX flow
consolidation delivered, but the overlay disagrees — a short reconciliation pass across those
documents is itself worthwhile. Fix: one primary entry point per context; retire or demote
the competing doors.

### EH-6 — Destructive actions lack one confirm-and-undo standard (essential, medium)

UX-MAP R-12 is only partially delivered: restore-point deletion gained typed confirmation, but
course deletion, lesson/node removal, data replacement and sync overwrites still mix immediate
dialogs, plain confirms and undo toasts. Users cannot transfer caution between surfaces, and
the dangerous action is the one whose pattern they have not met. Fix: a shared
confirmation/undo component and contract across the remaining flows.

### IM-1 — Checker disputes are collected, then go nowhere (important, medium)

`QuestionResponsePanel.tsx:193-211` collects "Checker got this wrong" disputes, persists them
(`repository.attempts.ts:168,195`), tells the learner "this evidence will be kept" — and no
review queue or re-grade surface consumes card-level disputes anywhere in `src/`. Worse, a
dispute nulls the grade, so correctly reporting a broken checker is strictly worse than saying
nothing. A broken promise plus a perverse incentive. Fix: a visible dispute queue, or honest
copy, and never punish the reporter.

### IM-2 — Hint penalty invisible at the point of use (important, small)

Covered in EH-1; listed separately because the disclosure fix is independent of any grading
feedback redesign: a one-line caption when a hint step is revealed ("Hints nudge scheduling").

### IM-3 — Scheduler internals leak onto learner surfaces (important, small)

`CardList.tsx:1285` shows a "Stability 4.2d" badge on every reviewed card and line 1305 a
"Leech" badge. The SPEC deliberately hides FSRS internals during study; the card list
re-exposes them untranslated. Fix: plain-language copy or progressive disclosure.

### IM-4 — Question deletion is unrecoverable (important, small–medium)

Course deletion has undo exposure; Question deletion does not, and its inline errors are
weaker. Route deletion through the shared danger-zone pattern (see EH-6).

### IM-5 — Empty course path dead-ends non-authors (important, small)

`CoursePath.tsx:594-600`: the empty-curriculum state's actionable hint shows only when
`authoring`; line 446's "Authoring is locked for shared courses" is `hidden … sm:inline`, so
it vanishes on phones. A student who imports an empty course sees a blank path with no
explanation. Fix: one honest sentence per case, shown at all widths.

### IM-6 — Focus-mode exit depends on hover (important, small)

`LearnMode.tsx:480-482` auto-hides header chrome on `pointerleave`; the dedicated exit control
is an unlabelled icon that disappears with the chrome. On touch there is no hover at all.
Fix: a persistent minimal exit affordance on touch plus a one-time "Press F or Esc" hint.

### IM-7 — Denied browser permissions leave no recovery path (important, small–medium)

UX-MAP gap G-09: if camera (QR scanning), persistent storage or clipboard permission is
denied, the app offers actions but never explains how to recover. Storage persistence is
existential for a local-first app — denial silently raises eviction risk for all study data.
Fix: per-permission recovery guidance.

### IM-8 — Course settings commit instantly, inconsistently (important, medium)

`CourseSettings.tsx` (doc comment, lines 43-48) commits every field on blur; within one panel
some controls commit on blur, some on change, some on release. A stray keystroke or an
experiment is persisted with no indication or revert. Fix: a consistent explicit-save model,
or a uniform per-field "changed · Undo" affordance.

### IM-9 — Global analytics speaks scheduler jargon (important, medium)

"Leeches", "stability profile", "retention by age", "prediction accuracy" with no progressive
disclosure (UX-MAP R-06 undelivered; the map itself notes analytics was never validated with
users). The invisible-grader design hides FSRS during study, then the analytics page
re-exposes it untranslated. Fix: plain copy, a glossary, or progressive disclosure per chart.

### IM-10 — Share page offers too many near-identical verbs (important, medium)

Codes, QR, publish, backups, lineage merge with stale detection — the teacher whose job is
"get my course to my students" must decode internal version labels (LAC0-LAC3), revisions and
"merge" language first. The confirm-before-import step is good; the menu in front of it is
not. Fix: task-led framing ("Share with a student", "Move to another device", "Back
everything up") with format mechanics demoted. Note: LG-1 is the full information-architecture
fix; this is the copy-level intermediate.

### IM-11 — "Undo scheduling" ghost button beside "Next Question" (important, small)

`QuestionResponsePanel.tsx` renders undo permanently, disabled only after use, with equal
visual weight to advancing, on every question. Mis-clicks are easy, and its presence invites
reflexive undo after any bad mark — which corrupts the scheduling signal. Fix: move it into an
overflow/menu area or behind a confirm.

### LG-1 — No single data centre for payload flows (optional-now, large)

R-03 (P0 in the map, status contradictory): publishing, receiving, backup/restore and device
sync each have their own screen, vocabulary and recovery language. The highest-stakes surface
in a local-first app, and every new payload type multiplies the divergence. A deliberate
information-architecture arc, not a copy pass.

### LG-2 — Item families sit outside the course path (optional, large)

R-05: questions, sequences and occlusions are authored and practised in separate surfaces, so
"everything I must learn lives on the path" is not what the interface represents. Large.

### LG-3 — Course-level vs global settings precedence is invisible (optional, large)

Settings says a course "can override" defaults; nothing shows whether a course value is
inherited or overridden, or where the override lives. The intermediate fix (inherited/
overridden badges with a "use global default" reset) is medium and worthwhile.

### LG-4 — AI trust flow not consolidated (optional, medium)

R-11: pairing, per-course permissions and revocation live in different screens with boundaries
explained only after the user has met them. A safety-bearing surface, but a niche one.

### LG-5 — Electron update state invisible (optional, small)

R-14: no UI for update availability, completion or failure. Wiring existing pipeline events
into the existing Settings status cluster.

### LG-6 — Dashboard sort configured far from where sorting is experienced (optional, small)

`useDashboardSort` is consumed by Dashboard but controlled in Settings → Appearance & access.
Nothing on the dashboard hints at it. Fix: a sort control on the dashboard itself.

### LG-7 — Sequence preview keeps wrong terminology after a type change (optional, small)

Walkthrough defect 12, still open: the first generated preview prompt says "First item?" after
the type changes to Procedure. The editor's copy argues with itself inside one screen.

### LG-8 — Question practice lags the card surface (optional, medium–large)

The cross-cutting pattern from the study-surface audit: Question practice trails cards on
keyboard support, undo prominence, progress display and exit conventions. Bringing it up to
the card surface's standard would resolve roughly a third of the study findings in one arc
(QW-2, QW-5, IM-1, IM-11 and parts of EH-2).

## Recommended sequence

1. **One quick-win pass** (QW-1 to QW-10): delivered 31 August 2026.
2. **The grading transparency arc** (EH-1 + IM-2): post-answer grade/interval feedback, the
   timing disclosure, and the hint-cost caption. Highest trust payoff in the product.
3. **The session-boundary arc** (EH-2 + IM-6): confirm-on-exit, resume, focus-mode touch exit.
4. **The authoring-safety arc** (EH-4 + EH-3 + IM-8): drafts and guards for the Question
   editor, view-first search, a coherent settings commitment model.
5. **Reconcile the roadmap** (EH-5's documentary half): align `next_plan.md` with the UX-MAP
   delivery overlay so delivered and undelivered work are distinguishable again.
6. **Deliberate roadmap arcs** (LG-1, LG-2, LG-8) as scheduled projects, not incidentals.

## Provenance note

Findings drawn from the project's own records (UX-MAP, MANUAL_WALKTHROUGH,
course-terminology-audit, BROWSER_QA_AUDIT) exclude everything those documents record as
fixed in the August follow-up verification. Code-level findings were verified against the
source at commit `3e3ec76`; line numbers refer to that tree and will drift.
