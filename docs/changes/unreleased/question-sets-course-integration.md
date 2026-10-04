- Added optional Practice Qs activities anchored after a lesson. Authors add them from the course
  overview's Add menu, choose an existing set, and can move or remove the activity without
  deleting its content or attempts. Each activity is a stop on the course path whose companion
  shows progress, the linked exam and editing. Question progress remains separate from Card
  mastery and FSRS.
- Backup v14 and Course share v5 preserve these activities, including fresh-import identity
  remapping, published lineage updates, sync, deletion and lesson undo. Shared courses exclude
  personal attempts; backup readers reject malformed activity rows without throwing.
- Published course updates now import and track assessment-linked Question Sets. Assessment
  identities and final dates survive updates, backup and peer sync. Local assessment edits,
  deletions and retained local set links cause an atomic conflict instead of silent replacement;
  learner attempt receipts and Card scheduling remain unchanged.
- Question Set authoring now follows set details, question text, marking, optional knowledge
  links and review. Nested parts show their parent introductions; question lists expose
  readiness and direct edits. Mark totals derive from marking points. The editor reuses the
  Settings section rail, and set choices use visible radio choices or focused panels rather
  than dropdowns.
- Practice evidence now shows current concept coverage, missing evidence, unresolved marking and
  attempt status. Changed question/source text, response options or marking criteria cannot reuse
  historical marks as current coverage. Fully unresolved marks display "Not marked yet"; totals
  include resolved marks only. An unfinished attempt offers a direct resume/marking action.
- Question Set authors can paste or drop a diagram into the question workspace, describe it and
  add an optional caption. Images and their prompt references use the existing atomic draft save.
- Question Set diagrams open in a keyboard-accessible viewer with fit/actual-size controls,
  including submitted responses and mark schemes. Library searches live in the URL, and returning
  from an editor or attempt preserves the search and scroll position.
- Added compact author actions for Question Sets: course sharing with preselection, and confirmed
  removal of the saved set and local draft. Previous attempts and their media remain available
  through a collapsed library history and the removed set's overview.
- Fixed exam deep links opened while the course path is already mounted: the details sheet now
  follows the route query instead of reading it only on initial mount.
