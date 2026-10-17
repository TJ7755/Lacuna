# 17. Accessibility & internationalisation

- Honours `prefers-reduced-motion: reduce` (all animation/transition durations
  collapse) and the per-user **motion-speed** setting.
- Modal editor shortcut handlers leave Tab available to focus trapping and
  field-specific navigation.
- Focus-visible rings on interactive controls; `aria-label`/`title` on icon
  buttons; `aria-pressed` on toggles and chips; `role="progressbar"` with value
  attributes on the bar.
- The app shell's first Tab stop is **Skip to content**, which moves focus past the sidebar
  to the page.
- Tabular numerals for figures; balanced text wrapping for headings.
- Every interactive element meets a **44px minimum target** (per WCAG 2.5.5 /
  Apple HIG), and touch-interactive elements carry explicit **active states** so
  presses are visible without `:hover`. A control that stays visually compact, such as
  the AI header's Disconnect or Sign out link, uses the `hit-target` utility, which
  extends its pointer area to 44px without changing its appearance. Compact chips
  (tags, suggestions) likewise keep their row height and extend only their hit area.
  The phone hit-area probe in `tests/e2e/direction-c-audit.spec.ts` checks every control
  on the routes it visits from the element's own hit point, so a widened pseudo-element counts.
- Copy is **British English** throughout; **no emojis** in product copy or UI.

- Keyboard and assistive-technology clicks receive the same press acknowledgement as
  pointer activation. Animated departing steps are inert and hidden from assistive
  technology; their incoming headings can receive focus without entering the Tab order.
  Data-settings modals release their focus trap as soon as closing starts. Inline
  confirmation swaps disable their outgoing controls in both directions, and fast
  reopening restores focus to the revived form or confirmation.
  Cancelling an inline confirmation preserves focus explicitly restored by its caller;
  the shared opener fallback runs only while focus remains within that confirmation.
- Diagram authoring supports Enter or Space to begin and commit a region, arrows to
  move it, Shift and arrows to resize it, and Escape to cancel a draft. In Select mode,
  the same arrows position the selected region. Region buttons announce their names
  and selected state. The name field follows normal Tab order; Ctrl/Cmd+Enter saves.
  Deleting a region moves focus to the region that takes its place, else the one before,
  else the canvas. A focused field is scrolled clear of the sticky action bar, which
  stays inside the page frame at narrow widths.
- The date and time picker focuses its selected date on opening. Day-grid arrows move
  by day or week across month and year boundaries; Home/End move to Sunday/Saturday.
  Page Up/Down moves a month, or a year with Shift, retaining the focused day where
  possible and clamping to the destination month's final day. Enter/Space selects
  without closing; Done or Escape returns focus to the trigger after valid time
  drafts are committed. Time fields retain their own keyboard controls and validation.
  The month/year label sits left of adjacent previous/next buttons. Jump to today
  retains the chosen time.
- Custom context menus (lesson actions, Today's course menu) open from right-click, the
  context-menu key or Shift+F10, never over text fields or selections, so ordinary editing
  menus stay intact. Each menu also has a visible trigger for touch and discoverability.
- Text never scales during an animation, and no surface clips or overflows the page at phone
  widths or with enlarged text.
- Generated sharing links and codes receive focus when they replace the focused action,
  without taking focus away from a different control chosen whilst work is pending.
- Ending an inline lesson rename returns focus to its opening control after Enter or
  Escape. Saving on blur preserves focus on the next control the learner has chosen.
- Bounded number settings (Pomodoro durations, practice-node defaults, days between
  lessons) can be cleared and retyped; they save on Enter or blur, Escape restores the
  saved value, and an empty or out-of-range entry stays unsaved with its bounds announced.
- Cards search has an accessible name; typed study answers retain a visible label.
  The new-course name input is associated with its visible label; activating that
  label focuses the input.
  Card rows expose a native details/selection button. Covered swipe actions are inert,
  and hover actions also appear when focus is within the row.
- Study overlays own their keyboard input. Opening editing, help or an exit
  confirmation cancels a grade that has not yet committed; its deliberate animation and
  inter-card pause remain unchanged. A stable study landmark receives focus when a card
  change or editor dismissal removes the previous control; typed questions focus their input.
  Working-card study uses the same focus hand-off for its working textarea, including the
  next card; departing inert fields cannot become the new focus target.
  Question-set attempts focus the current answer or selected marking choice and announce
  question context. Progression waits for saves to settle, preserving a different control
  deliberately selected whilst a write is pending. Resumption restores the saved choice.
  Blank-answer confirmation and dirty notes, corrections and reflection remain protected;
  manual marks always require an explicit learner decision.
- Step-completion actions are visible and usable during their entrance sequence. The notes
  screen and step-completion screen focus their primary action when focus has nowhere else
  to be, so Enter continues; a control the learner has already chosen keeps focus. Departing
  course pages are inert and hidden from assistive technology while the next page enters.
- Closing shared dialogs and inline disclosures become inert and hidden immediately;
  departing focus traps leave Tab alone.
  Sharing alternatives follow the same rule when switching or collapsing panels;
  quickly reopening a retained panel restores its active state without losing selector focus.

- Notification dismissal pauses while hovered or while keyboard focus remains
  inside the notification.
- Secondary text meets 4.5:1 against paper, surface and raised surface in both themes.
- Volt uses darker green for accent text and keyboard focus in light mode; lime-filled
  actions use dark labels. Keyboard rings use the readable accent ink at full opacity.
- Primary action labels meet 4.5:1 for each selectable accent in both themes; alternative
  accents use dark or white labels according to their fill.
- Restoring an archived course moves focus to the next restoration action, or the
  page heading when no archived courses remain, without overriding focus moved elsewhere.
- Archiving from Today returns focus to the next course action, or the Today heading
  when the queue becomes empty. Course menus announce their expanded state and close
  on Tab before native navigation continues from their trigger.
- Settings groups use native disclosure buttons at every viewport size; closed panels
  remain mounted but inert and hidden from assistive technology. Deep links open their
  containing group. Help uses grouped question disclosures with 44px buttons and a labelled search field; searching expands matching answers.

Course navigation reserves the width of adjacent controls; its tab strip scrolls when enlarged text would otherwise overlap them.

[Specification index](../SPEC.md)

When an input wrapper draws a focus ring or focus shadow, the nested field suppresses
its own shadow so there is one visible keyboard-focus indicator, not two.

Inline confirmations disable confirmation and cancellation, including Escape, whilst a
returned action promise or caller-owned disabled state is pending. Cancelling afterwards
retains the existing focus-return behaviour.

- Path editors are named dialogs. Their background is inert and hidden from assistive
  technology; focus starts in the sentence's name field (or Question Set choice) and returns
  to the source row after folding. Child popovers own Tab and Escape until they close.
  Done, Escape and outside activation save valid changes. Invalid names retain the editor,
  announce the problem inline and receive focus. Exclusion rows are full-width toggle buttons
  with stable accessible names and aria-pressed; the visual Excluded tag supplements the
  struck-through text. Dragging is available only in Edit mode, with live lift/move/cancel
  announcements and Escape cancellation. Row menus and Alt+ArrowUp/ArrowDown retain keyboard
  access to the same permitted lesson-anchor moves.
