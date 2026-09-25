# Lacuna — version 0.2.10

## Unreleased


- Reclaimed abandoned device-sync relay channels during the existing daily maintenance job.
  Each run scans a bounded page and resumes from a stored cursor. Cleanup uses the latest
  metadata or slot upload, waits 24 hours beyond the 90-day channel expiry, and rechecks
  uploads before deleting a group.

