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

### Replacing practice questions

An existing single-set path activity can choose a different saved Question Set through the same
picker used when adding it. Picker cancellation retains the editor's previous choice; cancelling
the editor retains the saved activity. Done validates the current same-Course set, Lesson anchor
and authoring permission in the write transaction. Activity identity, name and creation time survive.

Path progress follows the selected set's existing attempts. Old-set completion does not complete
a different set; a replacement with its own history retains that progress. Existing attempts remain
accessible through their original set and receipt, including attempts still in progress. Replacement
does not rewrite receipts, responses, marking or bank-family definitions, and does not change the
existing practice launch or variant-selection rules. Each activity still references one set.

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


### Joining part-way through

Course settings → Lessons → **Start Study from** selects a core Lesson for this learner’s
copy, including locked imports. Study bypasses earlier Lessons and their curricular Practice
stops without recording completion or mastery. Semi-linear access opens the selected Lesson
and the earlier catch-up prefix; later Lessons retain their usual completion gates. Linear
release dates still apply. Resetting to the beginning does not erase real progress or unlocks.
A removed starting Lesson falls back to the beginning.
The entry prefix follows the resolved path order, including a supported local lesson order;
assessment coverage and published lesson indices remain unchanged.

**Review earlier material** offers the earlier Cards directly through FSRS, using real recall
answers and the shared daily new-Card allowance. It is available beside the current Lesson in
the study preview and between steps, and becomes the next step when no later curriculum is
ready. Ordinary due reviews retain priority. Earlier Lessons stay outside later curricular Practice gates, including when lesson introductions
are switched off, so catch-up cannot hold the current class behind a year of earlier work.
Cards explicitly linked into a current Lesson still belong to its practice scope.
Automatic catch-up runs at most once per Study flow; further catch-up remains an explicit action.
Optional extension Lessons are not treated as prior knowledge or added to catch-up automatically.

Full-course assessment coverage and scheduling horizons are retained. Earlier Cards can enter
assessment Practice and dated revision windows without an in-app Lesson introduction; later
untaught material keeps its existing eligibility rules. No prior knowledge is assumed mastered.
The optional, unindexed `Course.studyStartLessonId` survives backups and peer sync but is not
published in course files or share payloads, and publisher updates retain the local preference.

[Specification index](../SPEC.md)
