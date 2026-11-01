# Technique practice scheduling

Technique memory is a derived projection of immutable first-marking receipts. It uses the existing deterministic Question FSRS scheduler; it does not change persisted records or infer technique mastery from Concept identity or diagnostic labels.

Only practice first answers count. Authored, non-knowledge technique allocations contribute their criterion totals once per distinct question presentation. Assistance before marking, disputes, competing first markings, unresolved criteria and invalid marks exclude the evidence. Later corrections do not rewrite the first answer. Undo removes its replay effect. Multiple criteria for the same technique form one review, rather than one review per mark.

Historical `full-good-otherwise-again-v1` receipts retain their original grading policy. New graded evidence uses Good for full marks, Hard for at least 60%, and Again below 60%; Easy is never inferred. Replay orders evidence by marking time, attempt identity and question identity, independently of database iteration order.

The target is the nearest strictly future assessment covering an available question bearing the technique. Explicit question-set assessment membership takes precedence; otherwise authored lesson coverage or specification-point coverage resolves applicability. Missing dates and unresolved specification coverage never broaden to a course-wide exam. Exam timing informs recall projections without changing ordinary FSRS due dates or stability. Techniques due after an assessment keep that date. Within the Course urgency window, Study can offer an earlier question only when the shared assessment-practice predicate predicts sufficient improvement below the exam target. Ordinary due work remains eligible. Outside that window, Study follows ordinary due status.

Diagnostic gaps remain visible as diagnostic history. Their scheduling override expires after the current technique review interval, with a one-day minimum. Without technique memory, the deterministic initial Good interval supplies a finite fallback. A later diagnostic demonstration supersedes the earlier gap; marking the same answer cannot erase its diagnosis. Knowledge and application gaps use the same finite fallback without manufacturing technique evidence.

Selection preserves the existing unseen-question requirement and blueprint balancing. Within the eligible novelty pool, due techniques take priority; blueprint cells and recent families still break ties before the oldest due boundary. Familiar questions require explicit consent and repeated presentations do not increase technique stability.

The library exposes unassessed, due and scheduled status, available/unseen capacity, and estimated recall now or at the applicable exam. This is practice evidence and a model projection, not a certification of mastery.

Study applies this policy to candidate questions before selection. Tagged questions use their applicable technique memory; untagged questions use Concept application memory. Technique-only questions have their own Study identity and do not manufacture Concepts. Concept scope still excludes untaught prerequisites, and lesson-only techniques require an accessible, introduced lesson.

The active Study sitting supplies a stable start time. A submitted or exposed question suppresses another automatic attempt for the same Concept or technique in that sitting, including when assistance, unresolved marking or undo prevents a memory update. Unfinished attempts can resume. Explicit practice remains available from Questions. Study completion uses the remaining eligible card and question work rather than the presence of an exam date alone.
