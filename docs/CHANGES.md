# Lacuna — version 0.2.10

## Unreleased

- Blocked startup when a pre-migration snapshot fails and the upgrade path crosses
  destructive schema versions 22, 24 or 26, including the default upgrade to v27.
  Failed snapshots remain retryable; upgrades crossing no destructive version can continue.

