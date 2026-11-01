# Technique practice scheduling

Technique memory is a derived projection of immutable first-marking receipts. It uses the existing deterministic Question FSRS scheduler; it does not change persisted records or infer technique mastery from Concept identity or diagnostic labels.

Only practice first answers count. Authored, non-knowledge technique allocations contribute their criterion totals once per distinct question presentation. Assistance before marking, disputes, competing first markings, unresolved criteria and invalid marks exclude the evidence. Later corrections do not rewrite the first answer. Undo removes its replay effect. Multiple criteria for the same technique form one review, rather than one review per mark.

Historical `full-good-otherwise-again-v1` receipts retain their original grading policy. New graded evidence uses Good for full marks, Hard for at least 60%, and Again below 60%; Easy is never inferred. Replay orders evidence by marking time, attempt identity and question identity, independently of database iteration order.

The target is the nearest strictly future assessment covering an available question bearing the technique. Explicit question-set assessment membership takes precedence; otherwise authored lesson coverage or specification-point coverage resolves applicability. Missing dates and unresolved specification coverage never broaden to a course-wide exam. Exam timing informs recall projections without changing ordinary FSRS due dates or stability. Techniques due after an assessment remain scheduled after it; learners can practise them through learn mode.

Diagnostic gaps remain visible as diagnostic history. Their scheduling override expires after the current technique review interval, with a one-day minimum. Without technique memory, the deterministic initial Good interval supplies a finite fallback. A later eligible technique review supersedes the earlier gap. Knowledge and application gaps use the same finite fallback without manufacturing technique evidence.

Selection preserves the existing unseen-question requirement and blueprint balancing. Within the eligible novelty pool, due techniques take priority; blueprint cells and recent families still break ties before the oldest due boundary. Familiar questions require explicit consent and repeated presentations do not increase technique stability.

The library exposes unassessed, due and scheduled status, available/unseen capacity, and estimated recall now or at the applicable exam. This is practice evidence and a model projection, not a certification of mastery.
