# 12. Navigation, courses & card management

- **Dashboard** lists courses in a responsive grid, each showing exam proximity, lesson
  count and the objective progress bar; the sidebar's **Review today** entry opens the
  cross-course due session. Course order is a configurable dashboard setting
  (recent, ready to study, mastery, exam date, name, or created; §4.3). Each course card
  carries a secondary **Study** action, launching that course's conductor directly
  (`/course/:courseId/study`) alongside the card's own click-through to its course path.
  If a conductor was interrupted mid-flow, a resume banner sits above the course grid; an
  interrupted conductor stores only its course identity and timestamps, so resume always
  recalculates the next step from current course state rather than trusting stale session
  data (Arc 10 §10.1 folded the former standalone Study Today page into this dashboard).
- **Course path** (`/course/:courseId`) is the primary navigation surface within a course:
  an ordered sequence of lesson nodes, checkpoints and practice nodes (§4.3, §14). An archived
  course reuses this surface for inspection, marks itself as archived and keeps every lesson node
  navigable into its read-only content. Practice, checkpoints and every study, authoring, settings,
  update-review or mutation route remain inaccessible until restoration; direct URLs return to the
  course overview. Read-only course analytics remain available.
- **Lesson view** (`/course/:courseId/lesson/:lessonId`) presents the lesson's notes and
  cards. The course-level conductor owns guided session entry and embeds this lesson's
  notes-first teaching flow when it is the next available path step. In Author mode,
  **Link existing cards** opens a searchable course-card picker and adds selected ordinary
  cards (sequence-generated cards are excluded) as
  `LessonCardLink` memberships without moving their primary lesson or duplicating their FSRS
  state. Linked rows are labelled, excluded from destructive bulk selection, and use
  **Remove from lesson** instead of deleting the underlying shared card; removal also clears
  that lesson's exposure record.
- **Cards** (`/course/:courseId/cards`) lists every direct-recall Card in a course regardless of
  lesson, sharing `CardList` with the lesson view's Card section. The old `/bank` route redirects
  here.
- **Questions** (`/course/:courseId/questions`) lists fixed Questions and generated families with
  their primary Concept, exposure and due state. It launches a ten-Question default session or an
  All due session. Due Questions come first, then unseen Questions; alternative primary Concepts
  are interleaved when available. This pool never consults the Card pool.
- **Card list** (`CardList`) supports per-card edit, suspend/flag, and an explicit **Select**
  action for bulk selection; a tag-filter row scopes both the list and the study session.
  In multi-select mode the bulk toolbar offers **delete** (with an Undo toast that restores
  a snapshot), **move** to another lesson within the same course context, and
  **"Assign to lesson…"** (reassigns selected cards' `primaryLessonId`, only offered where
  the list is passed a `courseId`). Assignment rejects cards outside that course or a target
  lesson outside it before changing any selected card, exposure or review history. Clicking a
  card row expands it in-place to show a **per-card forgetting curve** and **vital statistics**
  (see §14, Per-card analysis).
- Course creation can **start blank** or **import** material immediately (see §13). The blank
  path collects the course name and visible **Exam date** in one modal. The date defaults to
  seven days after creation at 23:59 in the learner's current IANA time zone; changing it preserves
  that wall-clock choice when the course and its mandatory **Final exam** assessment are created.
  Invalid or nonexistent local date-times block creation. The course still opens with an initial
  **Lesson 1**, while the import tab remains independent of these creation-only fields.
- **Sequences** (§5) have their own editor (`/course/:courseId/sequence/new`,
  `/course/:courseId/sequence/:sequenceId/edit`, and a lesson-scoped
  `/course/:courseId/lesson/:lessonId/sequence/new`), reached via "New sequence" entry
  points alongside "Add card" in both Lesson View (`LessonCardsSection`) and Cards.
  `CardList` groups a sequence's generated cards under its name (`GeneratedCardGroup`)
  and excludes them from bulk-select, since they can only be edited or deleted through the
  sequence.


[Specification index](../SPEC.md)
