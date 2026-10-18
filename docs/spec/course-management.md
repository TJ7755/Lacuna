# Courses, Lessons and path ownership

Start at [CoursePath](../../src/pages/CoursePath.tsx), [LessonView](../../src/pages/LessonView.tsx)
and the [course planner](../../src/course/studyFlowPlanner.ts). Repository writes live in
[courseRepository](../../src/db/courseRepository.ts) and [lessonRepository](../../src/db/lessonRepository.ts).

Path ordering expresses progression and assessment coverage. Moving a node must preserve valid
coverage and the existing access rules. Advisory Lesson prerequisites use stable same-Course
identities, independently of path order. They do not gate access, select study work or change
scheduling horizons. An informational checkpoint does not gate progress. The conductor
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

[Specification index](../SPEC.md)
