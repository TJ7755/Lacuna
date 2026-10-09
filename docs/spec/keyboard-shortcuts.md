# 18. Keyboard shortcuts (summary)

| Context                | Key                | Action                                |
| ---------------------- | ------------------ | ------------------------------------- |
| Global (shell)         | `Ctrl/Cmd+K`       | Toggle Quick search                   |
| Global (shell)         | `/`                | Open Search content                   |
| Global (shell)         | `?` (default)      | Toggle keyboard hints                 |
| Card editor            | `Ctrl/Cmd+Enter`   | Save (and add another, for new cards) |
| Card editor            | `Tab`              | Front -> Back -> Save-and-add -> Save |
| Sequence item editor   | `Ctrl/Cmd+Enter`   | Insert and focus the next item        |
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
menu.

Saved shortcut overrides are validated per action. Invalid records or values fall back
to the defaults without discarding valid overrides for other actions.

[Specification index](../SPEC.md)
