# Accessibility constraints

Every interactive element has a 44px minimum target, including compact controls whose hit area
extends beyond their visible shape. Controls have accessible names and visible keyboard focus;
state and status do not rely on colour alone. Secondary text and action labels remain readable
across supported accents and themes. Mechanical checks live in
[browser tests](../../tests/e2e/direction-c-audit.spec.ts), which check rendered hit areas.

All workflows remain usable by keyboard and touch. The shell exposes Skip to content. Dialogs
trap focus only while active; closing/departing controls are immediately inert and hidden from
assistive technology. A new view restores useful focus without stealing a different control
selected during pending work. Error feedback is associated with its field or recovery action.

Native inputs retain caret, composition and selection behaviour. Enter during IME composition
must not submit an unfinished value. Context menus retain normal editing menus over text fields
and selections; custom actions have a visible touch trigger.

Reduced motion and motion speed preserve the whole interaction. Text does not scale during
transitions. Layout and focused fields stay inside the page at phone widths, enlarged app text
and native browser zoom. Covered swipe actions and collapsed controls cannot receive input.

Progress announcements describe meaningful context without announcing every timer tick. Marks
require explicit learner decisions, and an unreadable Attempt remains unscored. Closing notes,
corrections and unfinished answers preserves their recovery choices.

Physical touch, native IME, assistive technology and actual zoom require the
[manual checklist](../WEBSITE_TEST_CHECKLIST.md); viewport screenshots and synthetic events do not
prove those capabilities. Use British English throughout product copy.
