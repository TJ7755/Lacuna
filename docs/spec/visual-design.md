# 3. Visual design system

### 3.1 Palette ("Direction C")

Defined as raw HSL triples in `:root` and overridden under `.dark`, then exposed as Tailwind
colours (`bg-surface`, `text-ink`, `border-line`, `text-accent`, ...).

- **Light:** pale green paper (`--paper`), near-white surfaces (`--surface`), green-black ink. The
  sidebar sits on a slightly darker `--chrome` ground.
- **Dark (default):** near-black paper and chrome ground, with the Volt neon foreground retained so icons stay defined, pale green ink.
- **Accent triad:** `--accent`, `--accent-soft`, `--accent-ink`, `--accent-fg`. The default
  is **Volt lime**; the user may pick **amber, red, rose, pink, violet, blue, teal or green**. Selecting one
  sets `data-accent` on the root and overrides just the accent triad, with separate light and
  dark recipes so each accent reads correctly in both themes.
  Use `accent` for filled actions and decorative highlights, `accent-fg` for their labels,
  and `accent-ink` for readable text, charts and keyboard focus. Neutral dividers carry only
  a faint green tint; warning colours retain their semantic role.
- **Semantic:** `--positive` (green), `--negative` (red) and `--warning` / `--warning-fg`
  (orange) for on-track, failure and behind-target states.
- **Chart series:** `--series-1` to `--series-5` follow `accent-ink` as categorical colours where
  lines stand for things rather than states (the exam-day forecast's courses), with separate
  light and dark values.
- **Surfaces:** cards and panels are flat (`rounded-3xl bg-surface card-surface`) with one
  1px hairline border (`--card-border`, drawn from `--line`) and no drop shadow or tinted
  halo. The neutral boundary follows light and dark themes across every accent, including
  Volt, violet and amber. Controls whose only boundary is the card edge add
  `card-surface-control`, using `--ink-faint` for at least 3:1 non-text contrast against
  paper, surface and raised surface. Keyboard focus rings remain visible. The study card
  retains its existing treatment, dimensions and motion. Buttons are pills; the primary
  button carries no shadow.
  Large buttons are 48px, level with a full-size menu, and link-styled buttons share
  `buttonClassName`; squared buttons are caught by `src/designRules.test.ts`. Opening an inline
  form never stretches its sibling buttons: closed actions keep their height throughout.
  Segmented controls are a pill track with a white pill that slides between options; when the
  options cannot sit side by side (a narrow screen or enlarged text), the track stacks them
  vertically at full width rather than overflowing its card. Choice chips wrap. The
  paper grain is off (`--grain-opacity: 0`).

### 3.2 Typography

- **Display (`font-display`, Space Grotesk):** headings (`h1`–`h4`) and large figures,
  weight 600 with tight negative letter-spacing. Page titles are `text-4xl` to `44px`.
- **Body (`font-body`, Instrument Sans):** all running text, including the landing page.
  Both faces are bundled locally (OFL) and precached so they work offline.
- **Brand (`font-brand`, Space Grotesk):** the Lacuna wordmark and course overview title.
- **Mono (`font-mono`, JetBrains Mono):** code only. Figures use `tabular-nums` in the body
  or display face; axis and metadata labels are never monospace.
- Labels are short, sentence-case and quiet (`text-sm text-ink-faint`); prefer an icon and a
  number to a sentence. Nothing in the app is set in capitals or letter-spaced, and no
  eyebrow label sits above a heading: the heading names the screen on its own
  (`src/designRules.test.ts` enforces the capitals rule).
- One name per action: **Study** always opens the session plan, a lesson page's direct action is
  **Study lesson**, and path practice kinds are **Card practice** and **Practice questions**.
  Counts pluralise ("1 card").
- A global font-scale control multiplies all text (see §15).

Choice architecture follows _Nudge_: a reversible default, the same mapping for the same
action everywhere, and an empty panel offers its next action (an empty lesson leads with
New card; controls with nothing to manage are hidden). Charts plot daily counts as bars and
continuous measures as lines, and never draw counts against a percentage axis.

Dashboard and course/lesson headings sit directly on the page without decorative panel
frames. Course cards and functional grouping retain their boundaries. Empty-course and
session-report states use small accent-coloured SVG line drawings in the landing page’s illustration
style, without changing their controls or motion. The course overview uses a compact winding
path without decorative study scenes. Neutral curved SVG strokes connect stops; completed
lesson nodes use the configured accent. Analytics empty states use drawings appropriate to
their subject, while populated charts remain clear.

### 3.3 Motion language

Motion is consistently used to **confirm actions and orient the user**, never gratuitously.
A `prefers-reduced-motion: reduce` media query collapses all animation and transition
durations to ~0 globally, so every effect below degrades gracefully. A per-user
**motion-speed** setting (Settings) scales every duration in the app by a single multiplier,
so the app can be as snappy or as gentle as the user prefers.

Shared conventions:

- Standard easing curve `[0.16, 1, 0.3, 1]` (a soft "ease-out-quint") for entrances.
- Springs for tactile controls and shared-layout indicators.
- Expanding action surfaces and disclosures share a physical spring with stiffness 420,
  damping 36 and mass 1. Motion speed scales stiffness by the inverse square of the
  multiplier and damping by its inverse, preserving the damping ratio. Reduced motion
  removes the interpolation; text remains at its natural size as the surface expands.
  Disclosure opacity takes 120ms times the motion multiplier. Nested settings retain
  mounted drafts while closed and inert. Note controls and annotation panels keep
  decoration and spacing inside the zero-height wrapper. Assessment editor step changes
  measure their height locally; StepSwap itself remains a content transition. The mobile drawer
  scrim fades independently of its opaque surface; mobile navigation retains its
  260/30 spring, scaled with motion speed. The touch sheet uses one position value for
  entrance, direct dragging, spring return and dismissal.
- Staggered list/grid reveals with a small per-item delay, capped so long lists do not crawl.
- `LayoutGroup` coordinates reflow animations across sibling elements (e.g. Settings' and
  Help's active-tab underline).
- Layout animation (`layout`, `layoutId`) comes from motion's `domMax` features, which the
  app's `LazyMotion` loads asynchronously (`src/motionFeatures.ts`) straight after first paint.
  Anything holding text animates with `layout="position"`, never `size`, so text is never
  scaled mid-animation; only text-free indicators (the sliding pills) animate their size.

- Celebration primitives (`components/ui/Celebration.tsx`): `CountUp` counts a figure up
  once (assistive technology reads only the final value) and `Burst` throws a short
  confetti burst. Both render statically or not at all when the multiplier is 0.

Specific motion (current state of the app):

- **Page transitions:** shell pages fade in through `AppShell` (`popLayout`) while the
  outgoing page leaves at once, so two pages never show together. The fade writes opacity
  only, and the tab drift below settles with no transform left behind, so `position: fixed`
  descendants stay viewport-fixed. Moving between adjacent course sections adds a 24px drift
  in the direction of travel (`TAB_DRIFT_PX`), not a full-width slide. Full-screen landing,
  method, conductor and Learn routes use the outer `RouteTransition` boundary, also a
  crossfade, with `AnimatePresence mode="wait"`. Both boundaries skip enter/exit when
  `prefers-reduced-motion` is on. Incoming page content sits still inside that fade:
  sections may fade on a short stagger (`Rise`, settings cards, Import) but never move.
  The first route appears immediately; this does not suppress entrances for content opened later.
  Course and lesson workspaces fade together over the local motion duration once their
  core records and notes are ready, with no section rise or stagger. New course warms
  both destination modules while the form is open; its inline lesson reuses the course's
  ready snapshot. Forecasts, scheduling configuration and related question sets do not
  delay the workspace. Live updates do not replay its entrance; reduced motion shows it
  immediately, and controls remain usable throughout the fade.
- **Course title:** section changes within the same course carry the name between the
  Path heading and persistent navigation, reversing when returning to Path. A reload,
  entry from Today or entry from another course shows the title in place. The travelling
  overlay clips the live endpoints until it settles; their own entrance fades cannot
  reveal duplicate titles. Inline single-lesson courses retain their navigation identity.
  Titles that fit on one line at both ends stay together during travel; multiline headings
  can wrap, with no clipping against the overlay's interpolated height. Departing headings
  stay hidden while their route finishes exiting.
  Reduced motion switches endpoints immediately.
- **Today’s Import action:** the neutral button expands into its own source chooser and
  import form using the same surface and spring as New course. Today stays in place.
  Cold opens wait for the form module while the trigger shows loading feedback; content
  is measured at its final width so both dimensions expand together. Source selection
  and All sources use opposite short slides with a crossfade, including the back button,
  while the panel height follows its content with the same spring. Text and Anki imports
  use compact input, review and destination steps without a panel scrollbar. The panel
  restores trigger focus on close and cannot close during an import write. Reduced motion removes the interpolation.
- **Scroll memory (`scrollMemory.ts`):** a new page starts at the top; returning to a page,
  by browser Back or Forward or by an in-app return (`state.returning`), restores where it
  was left, keyed by path and query. A query change on the same page keeps its place.
- **Shared controls:** `Button` scales to 1.02 on hover and 0.96 on press; `Toggle`, `Menu`
  and assessment sheets use the same global motion multiplier for their springs, fades and
  CSS transitions. Reduced motion removes these transforms and entrances. Every Button
  variant enforces a 44px minimum touch height.
- **Press feedback (`pressFeedback.ts`):** every other control (plain buttons, links, tabs,
  menu items, switches) sinks about 5px on press and springs back on release, so large
  surfaces dip as gently as pills. It animates the standalone `scale` property, so it
  composes with a control's own transform. Controls that animate their own press carry
  `data-press` to opt out.
- **Typing feedback (`typingFeedback.ts`):** typing in a text field, textarea or editable
  region gives a soft accent glow round the field that fades back to its resting style. Only
  the box shadow animates, so text, caret and layout stay still; a burst of typing shares one
  glow. It follows the motion-speed setting, and fields carry `data-no-typing-feedback` to
  opt out.
- **Progress bar (`ProgressBar`):** the fill animates to its new width on a spring; a slow,
  looping sheen sweeps across any non-empty bar for a sense of depth.
- **Sidebar:** width animates on collapse/expand (spring); the active-item marker slides
  within Today/Search content/Progress or within Share/Settings/Help, using separate
  shared-layout identities for those groups. Leaving a group selects the destination
  directly, without travelling or leaving an outgoing highlight. Course rows (including
  nested routes), Archived and the drawer's Import select directly. Pointer and keyboard
  navigation follow the same rule. The glide retains
  stiffness 500 and damping 38, with a sidebar-only 1.2 timing multiplier applied alongside
  motion speed through `scaledSpring`, preserving the damping ratio; items nudge
  right slightly on hover. Expanding a course's lesson list fades in place rather than
  tweening height. A collapsible drawer on mobile (§4.1); the drawer overlay and panel
  skip enter/exit when the motion multiplier is 0.
- **Course cards** (dashboard grid): no arrival stagger (that competed with the shell
  fade). A `whileHover` lift (`y: -4`) with a smooth surface-colour transition; a
  `whileTap` scale-down confirms the press. They do not carry swipe gestures — that
  affordance lives on card-list rows instead (below). Hover detail still grows the
  card by height so the grid can follow the pointer.
- **Card list rows** (`CardList`): in touch mode, each row supports a horizontal **swipe
  gesture** — drag left past a threshold to spring open a per-card action tray, drag right
  to quick-toggle the flag — backed by a `useSpring`-driven `useMotionValue` with a springy
  snap-back below the threshold.
- **Learn answer feedback:** after the card departs, a soft glow confirms the grade —
  green for correct, muted red for incorrect — with a radial pulse from the centre.
  Swipe feedback comes from the corresponding side; keyboard feedback rises from the foot
  of the screen. Both remain decorative (`pointer-events-none`) and independent of the write.
- **Study preview:** a single opaque neutral surface expands from the Study button and
  contracts back into it using the shared expansion spring. Only the button's own fill
  and label fade over 180ms times the motion multiplier, from its actual rendered colours
  into the card header and back on dismissal. The closed primary button remains Volt.
  The trailing arrow morphs into a cross using the same two SVG strokes and reverses
  on dismissal; it never swaps sides or mounts a different icon.
  The full-width body stays right-anchored and clipped, fading in place without a slide.
  Reduced motion applies the final appearance and geometry immediately.
- **Study card hand-off:** swipe, button and keyboard grades carry the card fully beyond
  the appropriate viewport edge in 200 ms before grading advances the session. Repeated
  inputs are ignored during departure, and unmounting cancels a pending grade. Incoming
  cards rise 20 px and settle from 97% scale over 280 ms, including repeated cards.
  The motion-speed setting scales these timings; reduced motion grades immediately.
- **Flip card:** the question/answer faces swap with a 3-D `rotateX` flip (perspective 1600).
  Swipes follow the pointer directly, with a compact Yes/No cue on the card. Abandoned
  swipes spring back; accepted swipes retain their offset through the shared departure.
- **In-place steps:** picker-to-options sheets, Learn reveal-to-grade, Question checking,
  Numeric/Working results, Lesson Study/Edit mode and other same-surface steps keep their
  chrome still and crossfade the step (`StepSwap`). Forward and back take a short sideways
  step; phase changes fade in place. Note, annotation, optional-constraint and staging panels
  also interpolate height instead of snapping open or shut.
- **Touch bottom sheets:** in touch mode, the Learn grading controls live in a fixed
  bottom sheet that springs in once; reveal and grade swap inside that sheet rather than
  replacing it. The card-actions menu is a similar bottom sheet rather than a dropdown,
  with a drag handle that closes it when dragged down past a threshold or flicked quickly.
- **Session report:** the whole panel rises in; reaching the goal springs in a tick badge and fires a confetti burst; the four stat tiles reveal in sequence with count-up numbers; the progress bar animates from before to after with a delta badge; a grade-distribution bar chart shows the rating breakdown.
- **Tabs / chips:** active-tab underlines and pills are shared-layout elements, including
  Settings, Help and the Course tabs. Batch-authoring workflow tabs use the same continuity.
- **Reordering and replacement:** lesson rows animate to their new positions; shared inline
  confirmations crossfade and resize while restoring focus to the exact trigger on cancel. Destructive
  confirmations use a contained rounded panel with a subtle negative-tinted surface and
  border, the existing consequence text, and grouped rounded destructive and secondary
  Cancel buttons. Narrow panels stack text above actions; non-destructive variants remain
  neutral. Returned promises disable both actions until settled, preventing repeat submits;
  existing caller busy states and error presentation remain authoritative.
  Lesson rows reserve their lifted border while resting so their bounds stay fixed during a drag.
- **Toasts:** slide in from the right with a slight scale.
- **Today’s arrival:** the exam-day forecast surface (chart, legend and week figures)
  waits for its review history and chart module, then fades in whole; the course rows
  follow, fading top to bottom 50ms apart, with rows past the fifth arriving together.
  Neither moves on entry. A forecast still pending after 600ms gives way: the rows appear
  beneath a placeholder that holds the surface's room, and a failed chart load shows the
  rows without it. The chart is measured before its first paint. Live updates never replay
  the entrance, and reduced motion shows everything at once.
- **Dashboard streak:** the flame icon gently pulses/rotates while a streak is alight; the
  streak number springs when it changes.
- **Pomodoro timer:** the compact face in the Learn header is a 36px SVG ring with a
  progress arc; the expanded popup is a 160px circular timer with a smooth 1Hz tick.
- **Mobile drawer:** scrim fade plus a spring slide-in of the sidebar.
- **Splash / route fallback:** the initial "Lacuna" wordmark fades up and breathes while the
  database opens; lazy routes show a pulsing "Loading…".

### 3.4 Touch-first design system

Added in v0.0.2. Every interactive element meets a 44px minimum target size (per
WCAG 2.5.5 / Apple HIG), and the app supports two input modes (`auto`, `touch`, `keyboard`)
chosen in Settings (§15). The mode drives which affordances are visible (hover-only on
desktop vs. always-visible on touch) and which gestures are enabled (swipe-to-act on touch,
keyboard shortcuts on keyboard).

- **44px targets.** `Button` enforces `min-h-11` (44px) on every size variant. All
  icon-only buttons, tabs, chips, filter controls, breadcrumb links and menu items inherit
  the same minimum.
- **Active states.** Touch-interactive elements carry an explicit `active:bg-ink/10` or
  variant-specific `active` colour so the press is visible without relying on a `:hover`
  that never fires on touch.
- **Swipe gestures** (touch mode only, gated on the resolved input mode). Card-list rows
  (`CardList`) drag left past a threshold to open a per-card action tray and right to
  quick-toggle the flag; the Learn flip card swipes right for Yes and left for No. Swipes
  are springy (a `useSpring`-backed `useMotionValue`), with a directional glow that follows
  the finger on the flip card, a threshold past which the action commits, and a snap-back
  below the threshold. The first successful Learn swipe hides the persistent swipe hints
  via a `localStorage` flag (`lacuna.learnHints`).
- **Bottom sheets** (touch mode). The Learn grading controls and the per-card actions menu
  render as bottom sheets with a drag handle, a scrim backdrop and a focus-trapped dialog
  role. On keyboard, the same actions live in a dropdown menu.
- **Bulk selection.** `CardList` enters multi-select through an explicit **Select** action.
  Ordinary cards can then be selected for bulk operations; generated sequence and occlusion
  cards are excluded because they are edited through their owning authoring entity. There is
  no long-press bulk-selection path in the current release.
- **Touch-visible utility.** A `touch-visible` class forces hover-only affordances to stay
  visible on `(hover: none)` devices (no-hover media query), so they cannot be hidden
  from touch users.
- **Input-mode awareness.** The `useIsTouchMode` hook (`src/state/inputMode.ts`) reads the
  user's setting and resolves `auto` initially from the primary pointer, then from
  mouse/keyboard or touch/pen activity. Components use it to switch between bottom sheets and dropdowns, show or
  hide swipe hints, and swap hover-only styles for always-visible ones.

### 3.5 Layout grid & surfaces

- Content is centred in a max-width frame per page: dashboard `max-w-6xl`; course overview
  Cards, Questions, Analytics, Settings and persistent course navigation 1190px;
  lesson view `max-w-3xl`;
  editor `max-w-4xl`; learn/report `max-w-3xl`. Study headers use a separate
  `max-w-6xl` frame and safe-area-aware 24px gutters, with the timer last at the right edge
  throughout notes, cards and between-step screens. Card actions sit before the timer;
  absent controls never need invisible spacers. The default header shows the course title
  and session progress; forecast recall lives in the card actions menu on desktop and touch.
  Search uses a centred `max-w-3xl` column
  within the shared page frame, with a centred
  heading and filters and a pill-shaped search field. Results use the same compact inset
  rows and active highlight as Quick search inside one rounded surface. Hover selects
  a row without lifting it. Newly appearing rows share Quick search’s gentle 6px upward arrival
  with a damped spring and eased fade, staggered by 18ms with a 90ms cap and scaled by motion speed; reduced motion
  shows them immediately. Existing rows do not replay on selection. Clear filters occupies a separate status row, so filter positions
  remain stable. Results retain reading alignment.
  Share uses the course-page frame, gutters and header spacing: its heading sits left and
  its course picker right on desktop, wrapping naturally on phones. The link card and Other ways
  align beneath the heading. Course switches keep the outer surfaces visible; only course-specific
  controls reset, while link height changes ease the alternatives into position without scaling text.
  Horizontal padding responds to
  screen width. The course overview pairs a compact winding path with a lesson companion
  on desktop and stacks those surfaces below 900px. All surfaces inherit Settings colours.
- Course sections share their heading size (36px, rising to 44px on desktop), top spacing
  and content edges. Course Settings uses the full frame for an asymmetric grid: a large study-goal and dates
  card beside stacked daily-workload and target-recall cards, followed by compact expanding rows.
  These cards stack on narrower screens. Settings and Help use the same heading
  rhythm, card surfaces and layout: three overview cards in the same asymmetric grid, then
  expanding rows at every viewport size. Persistent course navigation shows the course name only when the page's course
  heading is out of view, including headings loaded asynchronously. The course name travels
  and shrinks from the Path heading into this persistent identity when changing sections,
  then returns to the heading on Path. One visual layer stays outside the route fade and
  clipping; the real heading and link keep their semantics and interaction. Wrapped titles
  reflow as their text size and available bounds change. Reduced motion switches endpoints
  immediately. Inline single-lesson courses keep their course identity in navigation.
- Cards/sections: the shared `SectionCard` uses `rounded-3xl bg-surface p-5/6` with a
  single hairline border and no shadow. Settings cards share its surface tokens, as does `DialogPanel`. Use `SectionCard` (`compact` for `p-5`) rather than writing the classes out.
- Shared primitives in `src/components/ui/`: `Field` and `Input` for labelled form
  controls (label, hint, error). A label above its control is small semibold ink
  (`fieldLabelClassName`), its hint regular and faint; `Select` and inputs laid out in a row
  share the input's frame (`inputFrameClassName`), focused in the accent. Also `Skeleton`
  for loading placeholders, and `DialogPanel` with `DialogHeader` for centred modal dialogs (overlay, backdrop, a
  flat hairline card-surface panel like Quick search's, and a 44px close button).
- Pills/chips: `rounded-full border` with accent-soft active state.
- Sticky action bars (editor, course settings) pin to the bottom of the content column; the
  editor's bar fades up from the paper via a gradient so it never sits on a hard slab.
  Card repeat-save spans its action column above natural-width Cancel/Done and Add card;
  the added tally reserves space before the first save. Touch uses a compact two-row dock
  that follows the visible viewport above a keyboard and restores its navigation/safe-area
  offset when the keyboard closes. Answer-mode labels sit above their controls; reverse
  creation shares the responsive field grid. Compact card toolbars expose extra formatting
  through More and scroll their compact row at narrow widths rather than orphaning an action.

[Specification index](../SPEC.md)
