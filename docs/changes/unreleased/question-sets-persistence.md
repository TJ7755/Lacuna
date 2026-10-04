- Added durable authored Question Sets to backup v12, peer sync, course-share v4 and `.lacourse`
  course files, including strict parsing, reference validation, deterministic aggregate merges,
  deletion receipts, nested ID remapping and media reachability. The new `lacuna-v12` marker makes
  old readers reject rather than silently discard the added collection; legacy public backups and
  schema v22–v28 pre-migration snapshots remain readable. Backup record validation checks question
  sets with their own strict codec.
- Added device-local Question Set drafts with stale-edit protection, atomic finished saves,
  draft media retention and Course deletion/undo support. Immutable editing helpers retain
  question, part and subpart identities when reordered. Drafts are not backed up, shared or synced.
- Added serial Question Set authoring sessions: edits made during a save are retained,
  stale edits require explicit recovery, and unchanged publication preserves the existing
  content revision. Diagram assets and their draft references are committed together;
  asset cleanup now scans and deletes within one transaction.
