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


[Specification index](../SPEC.md)
