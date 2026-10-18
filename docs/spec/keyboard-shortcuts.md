# 18. Keyboard shortcuts (summary)

| Context                | Key                | Action                                |
| ---------------------- | ------------------ | ------------------------------------- |
| Global (shell)         | `Ctrl/Cmd+K`       | Toggle Quick search                   |
| Global (shell)         | `/`                | Open Search content                   |
| Global (shell)         | `?` (default)                | Toggle keyboard hints                 |
| Desktop app            | `Ctrl/Cmd+,`       | Open Settings                         |
| Desktop app            | `F1` / `Cmd+Shift+/` | Open Lacuna Help                    |
| Path or lesson (Edit)  | `Shift+F10`        | Lesson actions menu                   |
| Path (Edit)            | `Alt+Up` / `Alt+Down` | Move a lesson                      |
| Add lesson             | `Enter` / `Ctrl/Cmd+Enter` | Create and open / create and add another |
| Add practice questions | `Ctrl/Cmd+Enter`   | Add to path                           |
| Card editor            | `Ctrl/Cmd+Enter`   | Save (and add another, for new cards) |
| Card editor            | `Tab`              | Front -> Back -> Save-and-add -> Save |
| Question-set attempt   | `Ctrl/Cmd+Enter`    | Primary action; progress explicit manual marking |
| Sequence editor        | `Ctrl/Cmd+Enter`   | Save                                  |
| Sequence last item     | `Tab`              | Focus Add sequence / Save changes     |
| Question editor        | `Ctrl/Cmd+Enter`   | Save (and add another, for new Questions) |
| Sequence item          | `Enter`            | Next item (split at the caret); on an empty item, new section |
| Sequence item          | `Shift+Enter`      | Line break within the item            |
| Sequence item          | `Backspace` at start | Join to the item above, or remove a section break |
| Sequence item          | `Up` / `Down`      | Previous / next item                  |
| Sequence item          | `Alt+Up` / `Alt+Down` | Move the item (across a section break first) |
| Recitation (marking)   | `1`-`9`            | Mark that line missed, or correct again |
| Text editors           | `Ctrl/Cmd+B` / `Ctrl/Cmd+I` | Bold / italic                |
| Learn                  | `Space` / `Up`     | Show answer                           |
| Learn                  | `Down`             | Hide answer                           |
| Learn (silent grading) | `Y` / `Right`      | Yes (correct)                         |
| Learn (silent grading) | `N` / `Left`       | No (incorrect)                        |
| Learn (manual grading) | `1`, `2`, `3`, `4` | Again / Hard / Good / Easy            |
| Learn                  | `E`                | Edit current card                     |
| Learn                  | `U`                | Undo last answer                      |
| Learn                  | `F`                | Toggle focus mode                     |
| Overlays               | `Esc`              | Close                                 |

Single-key study shortcuts are inert while a text field or select is focused, during
IME composition, and while Ctrl, Cmd or Alt is held. Shift still supports capital
letters and punctuation bindings. The configured help key (default `?`) opens and
closes the overlay in both the shell and Learn; the displayed keys refresh on reopen.
The shell respects closing events already consumed by the overlay. The overlay can
also be opened from the "Keyboard shortcuts" item in the Learn mode 3-dot action
menu and, in the desktop app, from Help > Keyboard Shortcuts. The native menu adds only
existing actions: Settings (application menu on macOS, File elsewhere), Lacuna Help and
Keyboard Shortcuts. Quick search stays a renderer shortcut, because a menu accelerator would
consume `Ctrl/Cmd+K` before the page sees it.

Saved shortcut overrides are validated per action. Invalid records or values fall back
to the defaults without discarding valid overrides for other actions.
Capture accepts single keys, including shifted characters, explains rejected Ctrl/Cmd/Alt
chords and leaves composition keys untouched. Fixed Up/Right/Left aliases belong to
reveal/correct/incorrect respectively; Down, `/` search, `h` hints, `r` audio replay,
Escape, Tab and F1 Help remain reserved. Letter conflicts are case-insensitive.

Forms, Markdown editors, Quick search and AI composition leave input-method composition
keys alone, including the legacy key-code 229 signal. A nested field that consumes a
shortcut prevents the enclosing form from submitting it again. Single-line form Enter,
multiline newlines and Ctrl/Cmd+Enter retain their ordinary behaviour after composition.
Inline confirmations own Escape and Ctrl/Cmd+Enter: Escape cancels that decision and
returns focus to its available opener; the primary chord does not advance the editor
underneath or implicitly confirm a destructive action. Plain Enter activates the focused
confirmation button. Card-entry Tab jumps apply only when the target actually receives
focus; disabled or missing targets leave native forward and backward traversal available.

[Specification index](../SPEC.md)
