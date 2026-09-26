# 17. Accessibility & internationalisation

- Honours `prefers-reduced-motion: reduce` (all animation/transition durations
  collapse) and the per-user **motion-speed** setting.
- Focus-visible rings on interactive controls; `aria-label`/`title` on icon
  buttons; `aria-pressed` on toggles and chips; `role="progressbar"` with value
  attributes on the bar.
- Tabular numerals for figures; balanced text wrapping for headings.
- Every interactive element meets a **44px minimum target** (per WCAG 2.5.5 /
  Apple HIG), and touch-interactive elements carry explicit **active states** so
  presses are visible without `:hover`.
- Copy is **British English** throughout; **no emojis** in product copy or UI.

- Cards search has an accessible name; typed study answers retain a visible label.
  Card rows expose a native details/selection button. Covered swipe actions are inert,
  and hover actions also appear when focus is within the row.
- Study overlays own their keyboard input. Opening editing, help, navigation or an exit
  confirmation cancels a grade that has not yet committed; its deliberate animation and
  inter-card pause remain unchanged. A stable study landmark receives focus when a card
  change or editor dismissal removes the previous control; typed questions focus their input.
- Step-completion actions are visible and usable during their entrance sequence. Departing
  course pages are inert and hidden from assistive technology while the next page enters.
- Secondary text meets 4.5:1 against paper, surface and raised surface in both themes.

[Specification index](../SPEC.md)
