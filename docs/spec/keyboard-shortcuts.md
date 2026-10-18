# Keyboard ownership

The user-visible shortcut catalogue is defined in [ShortcutsSection](../../src/pages/settings/ShortcutsSection.tsx)
and the owning screen handlers. Update those and their tests together rather than copying a full
binding table here.

Overlays and active fields own their keys. Study grading must not intercept editing, composition,
a focused secondary action or an exit confirmation. Disabled/departing controls do not receive
commands. Tab remains available to native focus order, traps and the screen's deliberate field flow.

Sequences preserve their distinct repeated-entry loop: Enter adds an item; Ctrl/Cmd+Enter saves.
Question Set and individual Question shortcuts must follow their own explicit save/progression
semantics instead of being made superficially uniform. Preserve backward correction and the
learner's position through validation failures and async saves.

[Study handlers](../../src/pages/learn/useLearnKeyboardShortcuts.ts) enforce read-only unknown
payloads centrally: a shortcut cannot grant a grading path absent from the visible UI.

[Specification index](../SPEC.md)
