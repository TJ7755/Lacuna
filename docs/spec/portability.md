# Portability and published-content boundaries

`Course.creator` is a literal creator/project display label transported through `payload.by`, not
verified human authorship or approval. Null/absent `by` means no label; string values, including an
empty string, survive unchanged. Lineage updates use the existing Course-detail baseline policy,
retaining a locally edited creator. Legacy copies acquire the label on their next source update;
ordinary imports made by older builds cannot recover a label they discarded. These are additive
fields without a database/index or envelope-version change. Older share readers can discard them
on import/re-export, so lossless round-trips require a supporting build and the original source file
should be retained. Backups retain the metadata and validate the final reference graph.

### Question Set Concept recovery

For databases already damaged by earlier course updates, keep a full export of the affected device
and obtain an intact full backup from before the update or another paired device. Use Settings'
**Combine two devices** with that file, or sync with the intact device after both are updated.
Combine takes a restore point before replacement and retains Question Sets and attempt receipts.
Check the recovered course and export a fresh full backup afterwards. This restores original
Concept metadata; it does not reconstruct missing records from question text.

If neither snapshot contains the missing Concept, or its Course does not match, the merge still
fails without replacing the database. Keep the affected export and look for an older intact backup;
do not delete Question Sets or edit deletion receipts to force sync through. A snapshot whose
Concept records have all been lost cannot be repaired automatically by this workflow.

## Share-link transport

Deploy updated clients before publishing large compressed courses where possible. Already
installed old clients cannot be taught a new error message by this wire format: they reject the
envelope as an invalid course file (subscriber updates fail without applying it). Learners must
update Lacuna to import those courses or receive their updates. Courses that still fit within
4 MiB keep working on old clients.
