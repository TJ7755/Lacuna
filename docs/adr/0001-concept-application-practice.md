# Concept application practice from immutable Question Set evidence

Status: accepted for implementation; independent agent or human review required before merge.

## Decision

Application practice derives a separate course-scoped Concept schedule from Question Set Attempts.
Cards and legacy individual Question schedules retain their existing behaviour. Existing Questions
and historical attempts are not reinterpreted as attributable Concept evidence. This deliberately
avoids inventing atomic mastery from historical aggregate marks.

The Questions library serves one selected whole Question with its parts through the existing
Practice workspace. Ordinary Practice and Paper modes remain available. Each attributable criterion
assesses one Concept; a whole Question can assess several. Combined legacy allocations remain
readable but cannot manufacture separate Concept grades.

On completion, the Attempt freezes its first self-marked criteria, deterministic scheduler
configuration and versions. A Concept receives at most one update per Question, aggregating all its
criteria. Full credit maps to Good; partial or zero credit maps to Again. Hard remains successful
recall, not a reward for partial application. Missing, unsure, disputed or ambiguously attributed
criteria withhold the affected Concept's update. Assistance before completion withholds the whole
Question, conservatively including follow-through work. Prerequisites do not earn assessment credit.

Later corrections retain the original submitted response and first marks. Undo adds a timestamp;
replay excludes that Attempt without deleting evidence. Concurrent conflicting first marks remain
recorded and disputed, excluding their Question from scheduling. Replay uses the configuration in
each immutable snapshot, so subsequent Course setting changes cannot rewrite prior intervals.
Schedules are practice prioritisation, not calibrated mastery across arbitrary formats.

## Content and selection

[Portable bank schema v1](../question-bank/contract.md) reuses authored Question Set shapes. Import
validates every possible presentation before one transaction across existing stores. Each numerical
family is stored once with its finite declarative source; serving resolves only the selected
variant into an immutable receipt. No scripts, server or parallel database are introduced.
Materialisation is an explicit file-only audit/export operation. Import yields between family
audits so the browser can show progress. Referenced Concepts are retained compactly per set;
otherwise a large inventory copied onto every set would undo the storage savings.

Novelty fingerprints contain visible prompts, response format and MCQ options, excluding marks,
correct options and explanations. Authored-content fingerprints and revisions remain separate.
Shown-question tracking avoids treating unopened questions in a receipt as exposed. Automatically
submitted blank Paper responses do not count as visits. Family exposure follows
the visible template and its parameter arithmetic, so revised prompts can provide fresh work while
feedback-only changes retain exposure. Variant validation uses the same prompt/response/option
fingerprint as practice selection, including families whose options alone vary.
Selection prefers unseen presentations, avoids recent sibling families where alternatives exist and requires
an explicit familiar choice after exhaustion. Finite families do not promise inexhaustible content.
Displayed unseen capacity counts variant indices; cross-family presentation clones can reduce the
actual supply, and serving checks their fingerprints before exposing them.

Due practice prioritises scheduled weaknesses. Mixed practice balances least-exposed authored
(type, difficulty, context) cells, with one candidate per Question/family rather than one per
possible variant. Practice boundaries filter those exact authored values in either mode. Blueprint
skill is descriptive metadata; Concept IDs determine attribution. Official component/AO mark
weightings are not encoded in v1 and are not claimed by this UI. Author-maintained blueprint
profiles can be kept alongside banks without being silently interpreted as app policy.

## Compatibility and trade-offs

This extends existing Question Set and Attempt aggregates additively; no IndexedDB migration or
backfill is needed. New attempt snapshots opt in explicitly; absent historical snapshots stay
absent. Backups, recovery and sync carry the complete aggregates. Course files/share payloads carry
authored bank definitions and remap both rendered and family-source IDs, excluding learner attempts.
Lineage updates replace authored content while immutable old Attempt receipts survive.

All devices reading the new bank/evidence fields need this implementation. Older strict readers can
reject these aggregates; they must not be used to edit or restore new data. Rollback requires an
exported backup and a compatible app, not deletion of fields from the learner's only copy. Bank
removals are conservative: omitted old sets stay retained; import rejects older bank versions and
changed content without a version increment. No private course bank is shipped in the app.
