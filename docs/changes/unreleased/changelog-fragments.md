- Changes are now recorded as one fragment file each in `docs/changes/unreleased/` rather
  than as bullets at the top of this file, so parallel pull requests no longer conflict.
  `bun run changelog:release <version> [title]` folds the fragments, and any bullets still
  under "Unreleased", into the release section when a release is prepared;
  `bun run changelog:check` validates them.
