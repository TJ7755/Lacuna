# Learn screen redesign — card view, header and swipe

**Status:** ready, open questions answered. Starts once the loading work on
`fix/loading-placeholder-flash` has merged.

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

On an 812px-tall viewport every actionable element sits in the top two-thirds — controls at
0–70px, card at 100–450px, the No/Yes buttons at roughly 475–545px. Below about 560px there is
around 260px of dead space, exactly where a thumb rests. This is a desktop layout that happens to
fit a phone.

### Swipe grades silently — the most serious finding

A left drag across the card immediately committed a **No** grade: the progress pip turned dark red
and the session advanced. There was no drag feedback, no commit threshold, no confirmation and no
undo offered. On a real phone any stray horizontal movement — including an attempt to scroll a card
longer than the viewport — will record a lapse and damage that card's scheduling, possibly without
the learner noticing.

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

1. Rebuild the learn screen layout so the primary controls sit in the thumb zone on mobile and the
   card occupies the space above, with the desktop layout kept coherent rather than merely
   unbroken.
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

## Follow-ups, delegable once this lands

1. Remove the "Choose what to study" screen when only one option is available.
2. Landing page at 375px: the "SMOOTH SCROLL ON" pill overlaps the heading and obscures a word.
3. Dashboard: bring the study control above the fold on mobile.
