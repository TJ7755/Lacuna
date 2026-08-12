# Learn screen redesign — card view, header and swipe

**Status:** complete on `refactor/learn-screen-redesign`. Scope items 2, 3 and 4 are done and item 1
was withdrawn as already-implemented. Two of this plan's five findings were wrong; both are marked
in place rather than deleted, and the reason is the same in each case — they were written from a
browser session without reading the code underneath. The remaining follow-ups at the end are
unaffected and still worth doing.

**Written:** 12 August 2026

**Owner:** Claude Code (Opus). This is design work and must not be delegated to a Luna,
DeepSeek or Sonnet worker; see `CLAUDE.md`. The mechanical follow-ups listed at the end may
be delegated once the design is settled.

## Why this exists

Lacuna is not yet in real use. The prompter revises with other tools and intends to use Lacuna
for real from the start of the 2026–27 academic year, **primarily on a phone**. The study loop is
where nearly all phone time will be spent; course settings, the question bank and analytics can
stay merely adequate on mobile for the first term.

The prompter's own description was that the swipe, the menu and the card look are "off", and that
the top of the card view is cluttered even on desktop. A browser pass on 12 August confirmed all of
it and found the specific causes recorded below.

## Evidence, observed 12 August 2026

Dev server at `http://localhost:5173`, seeded "Welcome to Lacuna" course, guided study.

### Header is overloaded at every viewport

At 1310×814 the learn header carries eleven elements in a ~40px strip: hamburger, lesson title,
a subtitle line ("Loop until every card is correct"), five progress pips, "0%", a counter circle,
the pomodoro clock, a `⋮` overflow, a focus control, a fullscreen control, and Exit.

At 375×812 it carries six controls and truncates the title to "Core concepts & re…". Mobile shows
*fewer* controls, so this is not a mobile-specific fault — it is one overloaded design that mobile
makes unusable. The icons are visually undifferentiated and ungrouped.

### The card is a large empty container

At 375px the card is roughly 430px tall holding two lines of text floating dead centre. At desktop
it is 515×290 holding a single short line. Whitespace inside the card dominates the content at both
sizes. The dashboard compounds the effect with card-in-card nesting: a "Today" box inside the stats
card inside the page.

### The thumb zone is inverted (mobile)

**Incorrect. Corrected 12 August 2026.**

The original claim was that on an 812px-tall viewport the No/Yes buttons sat at roughly 475–545px
with around 260px of dead space beneath them. On a phone this is not what happens:
`TouchBottomSheet.tsx:34,64` is `fixed bottom-0 left-0 right-0` with 56px controls, and
`LearnMode.tsx:512` reserves `pb-40` beneath the card for it. Grading already sits exactly where a
thumb rests.

The measurement was an artefact of how it was taken. Input mode defaults to `auto`, which resolves
to touch only when the device reports touch points (`inputMode.ts:9-23`), and `useIsTouchMode`
reads that once on mount. A desktop browser resized to 375px after the page had loaded therefore
kept the pointer layout, in which the grading row *is* in the flow of the page and *does* sit
mid-screen. The pass measured the pointer layout at phone width and recorded it as the phone
layout.

`LearnMode.test.tsx` now asserts that touch grading is anchored to a `fixed bottom-0` container, so
this cannot regress unnoticed and cannot be mis-measured the same way again.

### Swipe grades silently — the most serious finding

**Largely incorrect. Corrected 12 August 2026 after reading `FlipCard.tsx`.**

The original claim was that a left drag committed a **No** grade with no drag feedback, no commit
threshold, no confirmation and no undo. Three of those four were already false:

- Swipe-to-grade is already restricted to the answer phase (`FlipCard.tsx:171-175`), so a drag on
  the question face does nothing.
- There is already a 60px commit threshold with a spring-back below it, and the drag is clamped to
  180px (`FlipCard.tsx:104-105,197-236`).
- There is already drag feedback: the card tracks the finger and a directional glow appears past
  half the threshold (`FlipCard.tsx:303-322`).

Only the undo claim held, and only on touch: `undoLast` existed but was reachable **solely by
keyboard shortcut**, which is no use to the phone user who made the accidental swipe. That gap is
now closed — a swipe-committed grade raises a toast with an Undo action, while deliberate taps on
Yes and No do not, so ordinary study is not interrupted on every card.

This entry is left in place rather than deleted, as a caution: the original was written from a
browser session without reading the handler, and it inverted the actual state of the code. Confirm
findings against the source before acting on them.

### Route friction into the loop

Dashboard to first card is three taps plus a scroll: the study control is below the fold behind the
title card and the stats block; then a "Choose what to study" screen that offers exactly one real
option; then lesson notes with Continue.

## Files

- `src/pages/learn/LearnHeader.tsx` — the overloaded header.
- `src/pages/learn/FlipCard.tsx` — card presentation and the swipe handling.
- `src/pages/LearnMode.tsx` — screen composition and layout.
- `src/pages/learn/TouchBottomSheet.tsx`, `src/pages/learn/TouchMenu.tsx` — existing mobile
  affordances; check what is already available before building anything new.
- `src/pages/learn/useLearnSession.ts` — session state and grading entry points.
- `src/pages/learn/useLearnKeyboardShortcuts.ts` — keyboard parity must be preserved.
- `src/components/learn/LineHint.tsx` — also references swipe; check for interaction conflicts.

Read these before designing. Do not assume the structure from this document.

## Decisions already taken

**Swipe stays.** The prompter likes swiping. It must be made safe rather than removed:
drag feedback that tracks the finger, an explicit commit threshold so a small movement does
nothing, a clear indication of which grade a release will commit, and an undo affordance after
it commits. A swipe must never be indistinguishable from a scroll.

**The daily loop is the whole scope.** Course settings, question bank, analytics and share are
explicitly out of scope for this plan.

## Scope

In scope:

1. ~~Rebuild the learn screen layout so the primary controls sit in the thumb zone on mobile and
   the card occupies the space above.~~ **Withdrawn:** this was already the behaviour on a real
   touch device; see the corrected finding above. The card-centring work under "Further findings"
   covered the remaining part of this item, which was that the card sat high within the space
   available to it.
2. Reduce the header to what is needed during study — at most title, progress and exit — and move
   the remainder behind the existing overflow. Applies to both viewports.
3. Make the card read as content rather than an empty container at both sizes.
4. Make swipe-to-grade safe, per the decision above.

Out of scope, and to be handled separately: the "Choose what to study" interstitial, the dashboard
study entry being below the fold, and the landing-page overlap defect (see Follow-ups).

## Answers to the open questions, given 12 August 2026

The three questions this plan was blocked on have been answered by the prompter:

1. **Progress keeps one form only.** The pip bar survives as the single progress indicator during
   study. The percentage readout and the counter ring are redundant encodings of the same value and
   move behind the existing overflow, along with the focus and fullscreen controls. The header
   during study is title, pips and Exit.
2. **The fullscreen/focus pair goes behind the overflow**, per the above. It is not removed.
3. **Swipe is restricted to the answer face.** Grading before the answer is shown is rarely
   intended, so this removes a whole class of accidental grading before the threshold work even
   applies. The threshold, drag feedback and undo from the swipe decision above are still required
   on the answer face.

## Further findings, 12 August 2026

Two defects found after the original browser pass, from a desktop screenshot of guided study.

### The card is not centred, and there are two separate pools of dead space

`FlipCard.tsx:377` sets `md:min-h-[29rem]`, a 464px floor regardless of content, so a two-line card
floats in a box around three times the height it needs. That is dead space *inside* the card.

Separately, `FlipCard.tsx:280` centres the card within a `flex-1` region, but the reveal button sits
below that region in `LearnMode.tsx:485`. The card is therefore centred in the space *above the
button* rather than in the viewport, and all remaining space collects beneath the button. That is
dead space *outside* the card.

**Decision:** the card shrinks to its content behind a modest floor of about 12rem, and the card and
its reveal button are centred together as one optical block rather than the card being centred
alone.

### Fast loading transitions read as a flicker

Route and data loads now resolve in tens of milliseconds, but the swap from placeholder to content
is a hard cut. An instant change with no transition reads as a flicker rather than as speed, so
making the load faster makes the effect worse rather than better. Hiding the placeholder on fast
loads (`useDelayedPending`, on `fix/loading-placeholder-flash`) is necessary but not sufficient.

**Decision:** route content crossfades in over a short duration, honouring `motionMultiplier` and
reduced motion, so a fast load settles rather than snaps. This lands with the loading work, before
this plan starts.

## Constraints

- Follow `docs/frontend-design.md` (available to Claude Code as the frontend-design skill).
  UI must look native and intentional, never bolted on.
- British English. No emojis. No TODOs, placeholders or stubs.
- Preserve keyboard parity and existing accessible names. The 16 July browser QA audit fixed
  missing accessible names on switches; do not regress that work.
- Preserve reduced-motion behaviour. The existing `motionMultiplier` path is honoured today.
- Do not change scheduling, grading semantics or persistence. This is presentation and interaction
  only. A safe swipe must produce exactly the same grade a tap produces.

## Territory — check before editing

Two other work streams touch this repository and must not be collided with:

- A performance branch (`perf/performance-audit-fixes-final`) is changing route transitions,
  animation and chart rendering, and has an unresolved fix in the `recordReview` write path.
  `docs/PERFORMANCE.md` items 1 and 7 overlap this plan's animation surface.
- A storage test branch (`test/card-history-consistency`) is writing tests against
  `src/db/repository.ts` and `src/db/mergeImport.ts`.

Confirm what has merged before starting, and expect a dev server in this checkout to reload
whenever another worker saves a file.

## Verification

- `bun run typecheck`, `bun run lint`, `bun run test` must pass before each commit.
- Verify visually at 375×812 and at desktop width, on both the question and answer faces.
- Prove the swipe threshold: a small drag must not grade; a committed swipe must be undoable.
- Do not judge performance from this branch; those fixes live elsewhere.

## Follow-ups — reconciled 12 August 2026

The three follow-ups below were delivered by work that landed after this plan. Each item is kept
in place and marked here with its verdict and evidence, following this file's habit.

1. Remove the "Choose what to study" screen when only one option is available.

   **Delivered. Verified 12 August 2026.** The interstitial was replaced outright by a bottom sheet,
   `src/components/learn/StudySheet.tsx`, opened via `StudySheetContext` from the sidebar
   (`src/components/layout/AppShell.tsx`) and the course path (`src/pages/CoursePath.tsx:469`).
   The old `StudyEntry` screen is no longer rendered anywhere; `src/pages/CourseStudyFlow.tsx:15`
   imports only `StudyFlowMessage` from that file. A separate worker is removing the dead
   component; the removal is not part of this plan.

2. Landing page at 375px: the "SMOOTH SCROLL ON" pill overlaps the heading and obscures a word.

   **Delivered. Verified 12 August 2026.** `src/pages/Welcome.tsx:329-346` now requires a
   `wheel` event before the pill is ever revealed. Touch devices emit no wheel events, so the
   pill has nothing to escape on a phone; revealing it on any scroll pinned a wide pill over the
   heading, and the reasoning is recorded in the comment at that site. On touch it now never
   appears.

3. Dashboard: bring the study control above the fold on mobile.

   **Delivered 12 August 2026, in two parts.**

   The first part was already in place: with an interrupted study flow, the resume control sat
   above the fold in `src/pages/Dashboard.tsx`, directly beneath a header that is compact at
   phone width (`p-4`, `mb-6`), above the stats strip and the course grid. But it was
   conditional on `resumableCourse`, so in the ordinary case — nothing to resume — there was no
   study control above the fold at all. Study was then reached through the sidebar's Review
   today control behind the hamburger drawer (`src/components/layout/AppShell.tsx:233-236`) or a
   course card's Study action, both an extra tap and the first hidden behind a menu.

   The second part closed that gap. The control now holds its position whether or not a flow was
   interrupted: it resumes when there is one, and otherwise opens the study sheet at its course
   picker via `useStudySheet`. It stays hidden until at least one active course exists, so the
   empty state still reads as create-a-course rather than offering study with nothing to study.

   The design question this plan left open — whether an unconditional study entry belongs on the
   dashboard — was answered yes, reusing the existing slot rather than adding a second control.
   A separate button in the header would have competed with New course at phone width, where
   wrapping was only recently fixed, and restoring a bottom-bar study entry would have undone the
   deliberate change in `b7d6ee7` that gave the mobile bottom bar to course sections.
