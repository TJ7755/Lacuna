# Recover Question Set Concepts

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
