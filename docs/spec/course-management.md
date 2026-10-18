# Courses, Lessons and path ownership

Start at [CoursePath](../../src/pages/CoursePath.tsx), [LessonView](../../src/pages/LessonView.tsx)
and the [course planner](../../src/course/studyFlowPlanner.ts). Repository writes live in
[courseRepository](../../src/db/courseRepository.ts) and [lessonRepository](../../src/db/lessonRepository.ts).

Path ordering expresses prerequisites and assessment coverage. Moving a node must preserve valid
coverage and dependency order. An informational checkpoint does not gate progress. The conductor
recomputes its next step after completion rather than trusting a captured future plan.

A Lesson can include another Lesson's Card through membership. That link does not transfer
ownership, create separate memory state or establish that the Card was encountered there.
Linked rows are not ordinary destructive bulk-edit targets. Questions have a separate practice
pool and evidence pipeline.

Archiving withdraws active study, authoring and mutation actions while retaining read-only material
and analytics. Restoration retains identity and history. Final-exam lifecycle and maintenance
horizons are described under [exam objectives](exam-objective.md).

Practice duration represents an estimate of work on the eligible pool, not an arbitrary fixed Card
count. Manual path nodes, curricular milestones and named assessment revision remain separate
concepts. A checkpoint's covered Lessons and excluded Cards must resolve consistently wherever
its eligibility or readiness is shown.

Published/locked content must use its supported review/import workflow rather than silently
unlocking authoring. School-specific or local preferences must not rewrite the publisher's source
order or become authoritative teacher corrections. Check the actual access and ordering resolvers
before adding another flag to a view.

### Local lesson order on locked imports

Course settings offers Move up/down and **Use publisher order** on supported locked
lineage copies. The preference applies to this local copy's path, Sidebar, guided Study,
Cards lesson groups and Simple Learn picker. Rename, delete, Add Lesson and content editing
remain locked. Ordinary authored courses still change their stored content order.

Support requires an active locked copy, free progression, automatic Card practice off,
no Card-practice nodes or checkpoints, and exactly one unanchored prefix final covering
all Cards without exclusions. Lesson-ID-anchored Question Set activities follow their
lessons. Prerequisites remain advisory. An unsupported shape suspends the saved preference,
explains why in Settings and on the path, and uses publisher order until supported again.
The course share format does not carry automatic practice settings: imports inherit the
learner's global defaults, so automatic practice may need switching off first.

`Course.localLessonOrder` is an optional, unindexed list of stable lesson IDs. Save validates
an exact current course permutation transactionally and stamps only the Course row. Reset
clears the preference, including while suspended. Resolution retains known preferred IDs
once, ignores stale IDs and appends omitted/new lessons in canonical publisher order
(index, creation time, ID). It returns original lessons without changing their indices.
Published content, lineage snapshots, assessment coverage, FSRS/exam targeting and
release/unlock obligations retain source order. New lessons are never hidden.

[Specification index](../SPEC.md)
