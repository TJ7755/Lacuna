# Lacuna — version 0.2.10

## Unreleased


- Consolidated decorative modal backdrops into a shared layer hidden from the
  accessibility tree, preserving each overlay's existing click-to-close behaviour.
- Removed repeated lesson headings from the notes-first study screen, leaving the lesson
  name in its header and the notes section heading above the content.
- Moved lesson deletion confirmation below its row so its consequences and action labels
  remain readable at narrow widths, including long unbroken lesson names. Cancelling
  returns focus to the delete button.
