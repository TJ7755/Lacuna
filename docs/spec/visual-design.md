# 3. Visual design system

### 3.1 Palette ("quiet laboratory")

Defined as raw HSL triples in `:root` and overridden under `.dark`, then exposed as Tailwind
colours (`bg-surface`, `text-ink`, `border-line`, `text-accent`, ...).

- **Light:** warm off-white paper (`--paper`), near-white surfaces, dark warm ink. Subtle.
- **Dark (default):** near-black charcoal paper, charcoal surfaces, warm off-white ink.
- **Accent triad:** `--accent`, `--accent-soft`, `--accent-ink`, `--accent-fg`. The default
  is amber; the user may pick **red, rose, pink, violet, blue, teal or green**. Selecting one
  sets `data-accent` on the root and overrides just the accent triad, with separate light and
  dark recipes so each accent reads correctly in both themes.
- **Semantic:** `--positive` (green) and `--negative` (red) for success/failure states.
- **Atmosphere:** the body carries a faint radial-dot paper grain (`--grain-opacity`,
  stronger in dark mode) rather than a flat fill; theme-aware thin scrollbars; accent-tinted
  text selection.

### 3.2 Typography

- **Display (`font-display`, Instrument Sans):** headings (`h1`–`h4`), default weight 400, slight
  negative letter-spacing. Page titles are `text-4xl`/`text-5xl`.
- **Body (`font-body`, Instrument Sans):** all running text, weight 400. The font is bundled
  locally and shared with the landing page.
- **Brand (`font-brand`, Fraunces):** the Lacuna wordmark.
- **Mono (`font-mono`, JetBrains Mono):** code, and `.tabular` numerals (progress %, stats,
  streak, timers) via `font-variant-numeric: tabular-nums`.
- Eyebrow labels are small uppercase with wide tracking (`tracking-[0.18em]`,
  `text-ink-faint`).
- A global font-scale control multiplies all text (see §15).

Dashboard and course/lesson headings sit directly on the page without decorative panel
frames. Course cards and functional grouping retain their boundaries. Empty-course and
session-report states use small amber SVG line drawings in the landing page’s illustration
style, without changing their controls or motion. The curriculum places up to three distinct study
scenes beside alternate lesson stops; completed lessons tint their scene amber. Curved SVG
strokes connect stops, with amber indicating completed stretches. Analytics empty
states use drawings appropriate to their subject, while populated charts remain clear.

### 3.3 Motion language

Motion is consistently used to **confirm actions and orient the user**, never gratuitously.
A `prefers-reduced-motion: reduce` media query collapses all animation and transition
durations to ~0 globally, so every effect below degrades gracefully. A per-user
**motion-speed** setting (Settings) scales every duration in the app by a single multiplier,
so the app can be as snappy or as gentle as the user prefers.

Shared conventions:

- Standard easing curve `[0.16, 1, 0.3, 1]` (a soft "ease-out-quint") for entrances.
- Springs for tactile controls and shared-layout indicators.
- Staggered list/grid reveals with a small per-item delay, capped so long lists do not crawl.
- `LayoutGroup` coordinates reflow animations across sibling elements (e.g. Settings' and
  Help's active-tab underline).

Specific motion (current state of the app):

- **Page transitions:** shell pages crossfade in place through `AppShell` (`popLayout`, so
  the outgoing page is taken out of flow and the two never stack). A fade writes opacity
  only — never a transform — so `position: fixed` descendants stay viewport-fixed.
  Moving between a course's sections still slides sideways in the direction of travel.
  Full-screen landing, method, conductor and Learn routes use the outer `RouteTransition`
  boundary, also a crossfade, with `AnimatePresence mode="wait"`. Both boundaries skip
  enter/exit when `prefers-reduced-motion` is on. The main scroll area resets to the top
  on every navigation. Incoming page content sits still inside that fade — settings
  sections, dashboard cards, editor shells, Help and Share no longer hop up after the
  route has already arrived.
- **Shared controls:** `Button` scales to 1.02 on hover and 0.96 on press; `Toggle`, `Menu`
  and assessment sheets use the same global motion multiplier for their springs, fades and
  CSS transitions. Reduced motion removes these transforms and entrances. Every Button
  variant enforces a 44px minimum touch height.
- **Progress bar (`ProgressBar`):** the fill animates to its new width on a spring; a slow,
  looping sheen sweeps across any non-empty bar for a sense of depth.
- **Sidebar:** width animates on collapse/expand (spring); the active-item marker is a
  shared-layout element (`layoutId="nav-active"`) that slides between items; items nudge
  right slightly on hover. Expanding a course's lesson list fades in place rather than
  tweening height. A collapsible drawer on mobile (§4.1); the drawer overlay and panel
  skip enter/exit when the motion multiplier is 0.
- **Course cards** (dashboard grid): no arrival stagger (that competed with the shell
  fade). A `whileHover` lift (`y: -4`) with a smooth shadow/border transition; a
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
- **Study card hand-off:** swipe, button and keyboard grades carry the card fully beyond
  the appropriate viewport edge in 200 ms before grading advances the session. Repeated
  inputs are ignored during departure, and unmounting cancels a pending grade. Incoming
  cards rise 20 px and settle from 97% scale over 280 ms, including repeated cards.
  The motion-speed setting scales these timings; reduced motion grades immediately.
- **Flip card:** the question/answer faces swap with a 3-D `rotateX` flip (perspective 1600).
  Swipes follow the pointer directly, with a compact Yes/No cue on the card. Abandoned
  swipes spring back; accepted swipes retain their offset through the shared departure.
- **In-place steps:** picker-to-options sheets, Learn reveal-to-grade, Question checking,
  Numeric/Working results, Lesson Study/Author mode and other same-surface steps keep their
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
  confirmations crossfade and resize while restoring focus to the exact trigger on cancel.
- **Toasts:** slide in from the right with a slight scale.
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
  user's setting and resolves `auto` to `touch` or `keyboard` based on the device's touch
  capability. Components use it to switch between bottom sheets and dropdowns, show or
  hide swipe hints, and swap hover-only styles for always-visible ones.

### 3.5 Layout grid & surfaces

- Content is centred in a max-width column per page (dashboard `max-w-6xl`, course path/course
  settings `max-w-2xl`, lesson view `max-w-3xl`, editor `max-w-4xl`, learn/report/search
  `max-w-3xl`) with responsive horizontal padding (`px-6 md:px-10`).
- Cards/sections: `rounded-2xl border border-line bg-surface p-5/6`, soft black shadows on
  hover.
- Pills/chips: `rounded-full border` with accent-soft active state.
- Sticky action bars (editor, course settings) pin to the bottom of the content column; the
  editor's bar fades up from the paper via a gradient so it never sits on a hard slab.


[Specification index](../SPEC.md)
