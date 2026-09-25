# Lacuna — version 0.2.10

## Unreleased


- Checked release tool versions against minimum safe versions and parsed builder
  targets and workflow action identities as YAML. Removed source-text checks already
  exercised by updater tests, Electron tests and release build gates.
- Removed repeated lesson headings from the notes-first study screen, leaving the lesson
  name in its header and the notes section heading above the content.
- Moved lesson deletion confirmation below its row so its consequences and action labels
  remain readable at narrow widths, including long unbroken lesson names. Cancelling
  returns focus to the delete button.
