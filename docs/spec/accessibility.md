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

- Keyboard and assistive-technology clicks receive the same press acknowledgement as
  pointer activation. Animated departing steps are inert and hidden from assistive
  technology; their incoming headings can receive focus without entering the Tab order.
  Data-settings modals release their focus trap as soon as closing starts. Inline
  confirmation swaps disable their outgoing controls in both directions, and fast
  reopening restores focus to the revived form or confirmation.
- Diagram authoring supports Enter or Space to begin and commit a region, arrows to
  move it, Shift and arrows to resize it, and Escape to cancel a draft. In Select mode,
  the same arrows position the selected region. Region buttons announce their names
  and selected state. The name field follows normal Tab order; Ctrl/Cmd+Enter saves.
- Generated sharing links and codes receive focus when they replace the focused action,
  without taking focus away from a different control chosen whilst work is pending.
- Ending an inline lesson rename returns focus to its opening control after Enter or
  Escape. Saving on blur preserves focus on the next control the learner has chosen.
- Cards search has an accessible name; typed study answers retain a visible label.
  The new-course name input is associated with its visible label; activating that
  label focuses the input.
  Card rows expose a native details/selection button. Covered swipe actions are inert,
  and hover actions also appear when focus is within the row.
- Study overlays own their keyboard input. Opening editing, help, navigation or an exit
  confirmation cancels a grade that has not yet committed; its deliberate animation and
  inter-card pause remain unchanged. A stable study landmark receives focus when a card
  change or editor dismissal removes the previous control; typed questions focus their input.
- Step-completion actions are visible and usable during their entrance sequence. Departing
  course pages are inert and hidden from assistive technology while the next page enters.
- Closing shared dialogs and inline disclosures become inert and hidden immediately;
  departing focus traps leave Tab alone.
  Sharing alternatives follow the same rule when switching or collapsing panels;
  quickly reopening a retained panel restores its active state without losing selector focus.
- Secondary text meets 4.5:1 against paper, surface and raised surface in both themes.
- Restoring an archived course moves focus to the next restoration action, or the
  page heading when no archived courses remain, without overriding focus moved elsewhere.
- Archiving from Today returns focus to the next course action, or the Today heading
  when the queue becomes empty. Course menus announce their expanded state and close
  on Tab before native navigation continues from their trigger.
- Settings and Help expose the same native section selector below desktop widths, so
  their topics remain reachable with a keyboard when the section rail is hidden.

[Specification index](../SPEC.md)
