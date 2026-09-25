# Lacuna — version 0.2.10

## Unreleased

- Added CI per-file coverage gates for schema migration snapshots, card and ordering
  repositories, and Learn-session persistence and orchestration. Thresholds use measured
  [baselines](maintenance/coverage.md) so a strong file cannot hide a weak one behind an
  aggregate percentage.
