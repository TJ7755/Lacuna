- Implemented the Paper Question Set authoring interface: real set/draft library, nested
  questions and parts, separate Question/Mark scheme/Links steps, written/calculation/MCQ
  formats, manual concept and related-card linking, lesson/exam selection, described images,
  local autosave and validated Save set. Existing individual Questions remain accessible.
  Author preview shows source context and response layouts without recording learner evidence.
- Added durable personal Question Set attempts in schema v29 and backup/sync v13. Each attempt
  retains its authored questions, diagrams and mark scheme, immutable submitted answers,
  separate corrections and annotations, self-marking decisions and resume position. Practice
  reveals whole-question feedback; Paper waits for submission. Conflicting originals fail
  explicitly during sync. Attempts remain private when sharing Courses and never update Card FSRS.
- Added the Paper learner interface for Question Sets: one answerable part at a time, tall
  written/calculation fields and multiple choice, Practice/Paper submission timing, unanswered
  confirmation, saved resume, and one self-marking criterion beside the original response.
  Added highlights/comments, separate corrections and optional reflection, related-card assistance
  recording, explicit zero/unsure/unmarked decisions, provisional results and attempt history.
  Serial saves retain queued work through failures and drain edits made during slow writes.
- Fixed repeated Question Set attempt merges: combined evidence receives a deterministic bounded
  revision instead of reusing a constituent revision, so subsequent sync with either source does
  not report a false conflict or revert the selected progress. Starting an attempt now reads its
  Course/set and saves its receipt atomically, preventing an orphan attempt if Course deletion
  happens at the same time.
- Replaced the native Question Set image input with a compact chooser, selected-image preview
  and filename. Description and insertion controls appear only after selection; clearing or
  inserting returns focus to the chooser.
- Added related Question Sets to lesson pages, exam details and expanded Cards through existing
  lesson/assessment/Concept links. Practice preserves its entry route; returning to an exam
  reopens its details. These links never alter Card scheduling or create duplicate concepts.
- Added an on-demand Practice evidence panel to Question Set overviews. It separates first
  recorded and repeated attempts, shows self-marked totals and marking dimensions, and keeps
  unresolved marks explicit. Only submitted originals enter denominators; pinned receipts
  preserve historical marks, corrections do not replace evidence, and multi-concept criteria
  are counted once. This is descriptive evidence, not a calibrated exam forecast.
