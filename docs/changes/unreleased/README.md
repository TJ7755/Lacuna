# Unreleased change fragments

Add one Markdown file here per change instead of editing `docs/CHANGES.md`, so parallel pull
requests do not conflict. Name it `<issue-or-pr-number>-<short-slug>.md` (for example
`358-practice-scope.md`), or `<short-slug>.md` when there is no number.

The file holds the bullet(s) exactly as they should appear in `docs/CHANGES.md`, starting with
`- ` and ending with `(#NNN)` where applicable. `bun run changelog:check` validates fragments.
`bun run changelog:release <version> [title]` folds them, with any bullets still under
"Unreleased", into the release section and deletes them. This README is ignored.
