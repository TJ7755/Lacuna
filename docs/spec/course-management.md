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
  In Edit mode, manual card practice, Question Set activities and checkpoints expose the same
  trailing actions menu as lessons: Edit, Move up/down between lesson anchors, and confirmed
  deletion. Deleting an activity retains its cards or question set and attempts. View mode has
  no authoring menus. Assessment rows also expose Edit; the required final assessment cannot
  be moved or deleted.
  Selecting an authored checkpoint, card-practice or Question Set row in Edit mode opens
  an editor over that row. The Assessments card uses the same editor; Add expands it from
  its trigger. Checkpoints read “Name on date and time, covering everything so far / chosen
  lessons”, with excluded cards appended as “except N cards”. The searchable exclusion picker
  groups toggle rows by lesson; excluded rows are struck through and labelled Excluded.
  Card practice reads “Name practises all cards / N cards from all lessons / chosen lessons,
  in lesson / random order”. Question Set activities read “Practise question set”; an existing
  activity retains its set identity. Position is edited on the path, with no position field.
  Done, Escape and outside presses save valid drafts; an invalid draft remains open with
  an inline error and focus on its offending control. A new Question Set editor with no saved
  sets and no selected draft closes without creating an activity. Deletion uses an anchored confirmation.
  Holding any authored path row for 350 ms lifts it for vertical dragging. Neighbours make
  room, viewport edges scroll, Escape cancels and release persists through the same repository
  operations as Move up/down. Alt+ArrowUp/ArrowDown moves between the same lesson anchors.
  Invalid coverage/dependency destinations are refused. Computed automatic-practice stops
  are not authored records and remain outside reordering; the final assessment stays fixed.
- **Lesson view** (`/course/:courseId/lesson/:lessonId`) presents the lesson's notes and
  cards. Its course-name link has a back chevron leading to the course path. In Edit mode,
  **Select** shares the **Manage** heading row above **Answer by**. Both lesson card lists
  show card kinds as icons with the existing kind names as accessible labels and tooltips.
  The course-level conductor owns guided session entry and embeds this lesson's
  notes-first teaching flow when it is the next available path step. In Edit mode, the card
  panel's **New card** is the single way to add cards: it opens the card editor, whose type
  picker keeps **Import cards** beside it and reveals the rarer types, **Sequence**, **Image
  occlusion** and **Link existing cards**, behind **More**. **Link existing cards** opens a searchable
  course-card picker and adds selected ordinary cards (sequence- and occlusion-generated cards
  are excluded) as
  `LessonCardLink` memberships without moving their primary lesson or duplicating their FSRS
  state. Linked rows are labelled, excluded from destructive bulk selection, and use
  **Remove from lesson** instead of deleting the underlying shared card; removal also clears
  that lesson's exposure record.
  While a lesson has no cards, its card panel's **New card** is the primary action and there
  is no management section. A one-lesson course with no cards and no notes disables
  **Study** and its `S` shortcut, because the study flow would open an empty notes step.
- **Cards** (`/course/:courseId/cards`) lists every direct-recall Card in a course regardless of
  lesson, sharing `CardList` with the lesson view's Card section. Its header's **New card** is
  the page's one way to add content, through the same type picker; cards made there are
  unassigned. The old `/bank` route redirects here.
- **Questions** (`/course/:courseId/questions`) lists fixed Questions and generated families with
  their primary Concept, exposure and due state. It launches a ten-Question default session or an
  All due session. Due Questions come first, then unseen Questions, then Questions shown but never
  scheduled (abandoned or ungraded); alternative primary Concepts
  are interleaved when available. This pool never consults the Card pool.
- **Card list** (`CardList`) shows each card as one row: up to two lines of question, one line
  of answer, and when it next comes up (New, Due, Later today, Tomorrow, In N days, Suspended
  or Buried, agreeing with the Due filter). An occlusion card shows its diagram, with the asked
  region marked, and the region's answer. The Cards page holds every lesson in one panel, with
  each lesson's heading kept below the course bar while its cards scroll (from the `sm`
  breakpoint). On hover the schedule gives way to Flag, Edit and Delete; below `sm` and on touch
  screens those actions live in the swipe tray and the expanded row instead.
- The card list supports per-card edit, suspend/flag, and an explicit **Select**
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
  **Lesson 1**, with keyboard focus on its **New card** button, while the import tab remains independent of these creation-only fields.
- **Sequences** (§5) have their own editor (`/course/:courseId/sequence/new`,
  `/course/:courseId/sequence/:sequenceId/edit`, and a lesson-scoped
  `/course/:courseId/lesson/:lessonId/sequence/new`), reached through **Sequence** in the
  card editor's type picker from both Lesson View and Cards.
  `CardList` groups a sequence's generated cards under its name (`GeneratedCardGroup`)
  and excludes them from bulk-select, since they can only be edited or deleted through the
  sequence.

[Specification index](../SPEC.md)
