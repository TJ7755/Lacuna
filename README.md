# Issue 828 regression evidence

Base: `acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46`.
Candidate: `0dca2bd7a897c786784b84899f702ccc0bd7b148`.

All browser content is synthetic. Hosted session and marking responses are intercepted;
no real learner data, credentials or paid provider requests appear here. Local paths are redacted.

- [Before](before.png): Not marked remains selected and the low-confidence sentence appears.
- [After](after.png): saved Unsure is selected after a reload, with no explanatory sentence.
- The after screenshot uses the same isolated candidate build on port 4428, after its selected-state animation settles.
- The focused browser regression also proves leave/re-entry, reload, numeric override and learner decisions during an in-flight result.
- The unit regression fails on the base runner and passes after the fix. Repository coverage includes guarded writes and existing backup/import/sync handling.

Exact commands and output are retained in the text files. Full matrix results will be added when the current run completes.
