# Question Sets authoring — paused checkpoint

Updated: 27 September 2026. Paused at the prompter’s request.
Branch: `feat/question-sets-authoring-flow`, branched from `feat/question-sets` at
`3d1acd45`. This branch includes the earlier Question Sets V1 implementation and UI fixes.
No PR or release has been created for this checkpoint.

## Why this work exists

The prompter rejected the authoring UX: no obvious order, unclear distinctions between
set settings, question introductions, parts, schemes and links. Replacing dropdowns with
panels and a Settings-style rail did not fix that underlying problem. This change replaces
that authoring arrangement with an ordered flow, informed by the existing individual
Question editor and primary-source research.

Read [the research note](../research/question-set-authoring-flow.md) and the broader
[implementation checklist](question-sets-implementation.md). The earlier checklist’s
Settings-rail authoring direction is superseded by this checkpoint; its backend and
release verification records remain relevant.

## Implemented at this checkpoint

1. New sets start with their title and optional lesson/exam links, with no empty question
   inserted automatically. Continue opens the set’s question list.
2. Add or edit a question follows **question text and response → mark scheme → linked
   knowledge → question list**. Back preserves draft content. The current Q1/(a)/(i)
   label and a small progress indicator identify the current task.
3. Question text starts editable. Image insertion uses the existing chooser/paste/drop
   component. Response formats retain the existing written, multiple-choice and calculation
   choices. No select/disclosure controls were introduced.
4. Separate parts and subparts are explicit actions. Their parent becomes an introduction;
   child editing shows its ancestor introductions. Converting a parent with a mark scheme
   requires confirmation before discarding that answer configuration.
5. Authors edit one marking point at a time. Each point has its criterion, marks, assessment
   dimension and optional guidance. The answer total derives from allocations rather than
   requiring a second, potentially contradictory total. Display wording is “Exam technique”;
   the stored assessment-dimension key is unchanged.
6. Concept/card links remain optional and use the existing linking system. No scheduling,
   FSRS, prediction or storage model was replaced. No Jev or automatic marking was added.
7. The question list shows nesting, readiness, marks and direct edit/add/reorder/remove
   actions. Review provides direct edits, student preview and the final Save set action.
8. Existing autosave, conflict handling, draft-copy recovery, validation, media checks and
   publication are retained. A returning named draft opens the list. Step changes focus the
   heading while keeping the full header and back link visible.

UI implementation stayed with the main agent. A fresh Sol agent researched the authoring
flow and wrote the research note; it did not implement the UI.

## Main implementation files

- `src/pages/QuestionSetEditor.tsx`: ordered flow and existing draft-session coordination.
- `src/components/question-sets/QuestionSetContents.tsx`: nested contents and readiness.
- `QuestionSetQuestionStep.tsx`: focused question, marking and linking views.
- `QuestionSetDraftFeedback.tsx`: extracted existing recovery actions.
- `QuestionSetSchemeEditor.tsx`: allocation editing and derived total.
- `QuestionSetPromptEditor.tsx`: always-editable prompt.
- `question-set-flow.css`: focused layout and responsive presentation.
- `src/pages/QuestionsPage.tsx`: create an empty set before adding questions.
- `src/pages/QuestionSetEditor.test.tsx`: ordered flow, validation, multipart and preservation
  regressions. A stale legacy-page heading assertion was corrected separately in `3d1acd45`.

## Verification completed

- The initial new-flow test failed against the pre-overhaul UI (one failed, seven passed).
- 57 focused tests across 16 files passed: editor, library/navigation, Question Set
  components, authoring model and draft session.
- Web typecheck, focused ESLint and production asset build passed. Existing Vite chunk and
  ineffective-dynamic-import warnings remain.
- Production browser on `127.0.0.1:5183`: created a new set from the library, entered a
  question and two-mark scheme, visited links, reviewed and previewed the learner view and
  scheme, reloaded the draft, verified retained content, linked Osmosis, and saved the set.
- At 390×844: added Q2 → (a) → (i), verified both ancestor introductions, completed an
  application marking point, returned to review and saved. The review showed two questions
  and three marks. Main width remained 390 px; no horizontal overflow.
- Final small scroll adjustment was built and checked in the browser: entering Q1 focused
  H1 and kept the header visible (top 69 px at 390 px width).
- Browser screenshots and a recording are in this conversation’s local artefacts. They are
  not portable repository assets and are not needed to run the branch.

This is a tested checkpoint, not acceptance of the UX. The prompter has not reviewed the
new ordered flow. Do not describe V1 as signed off.

## Resume here

- [ ] Let the prompter try the ordered flow before another broad redesign.
- [ ] Review the full question/marking/linking sequence visually at desktop and narrow widths,
      including longer prompts, images and several marking points. Forms still require scrolling.
- [ ] Review return-from-review editing: it currently returns to the contents list after Done,
      rather than directly to review. Decide whether that extra step should be removed.
- [ ] Check whether the set title heading changing from “Create a question set” to “Set details”
      while typing is distracting; no functional failure was observed.
- [ ] Remove obsolete question-editor rail CSS and unused flow-header styling after confirming
      no remaining consumers. The shared Settings navigation must remain intact.
- [ ] Consider consistent “Marking point” / “Criterion” and “Exam technique” wording in the
      existing preview/evidence views; this checkpoint changes authoring wording only.
- [ ] Add focused allocation add/remove-total coverage if the next refinement changes that
      behaviour. Current save regression verifies a two-mark allocation and derived total.
- [ ] Run the relevant tests and browser gate after subsequent changes; capture final screenshots.
- [ ] Retain the broader release checks: physical touch, screen reader, interactive packaged
      Question Sets and real cross-device relay. This UI checkpoint did not repeat those checks.

## Local continuation context

Working tree: `/Users/tj7755/Documents/Coding/Lacuna-question-sets` (different from the main
`Lacuna` checkout). Preview was running on port 5183, collaborative tab `tab_2`.
The production service worker can retain old bundles after a rebuild: unregister it and
navigate to a fresh document URL without clearing IndexedDB. If preview frames stall, the
recording workaround is documented in `MEMORIES.md`.

Browser-only verification set created during this work:
`16e5fce1-8e18-4c73-8950-7bd87f1ad784`, “Biology · Cells and transport”, course
`b4a98502-f776-4c47-8f6b-ff9718f039c3`. It is saved with Q1 and Q2(a)(i), three marks total.
These IDs describe local test data, not seeded product content. Preserve unrelated user drafts.

Persistent instructions: British English, no emojis, minimal native UI, no dropdown-based
Questions flow, root agent owns UI work, use fresh Sol/Luna agents only for delegated work,
commit coherent stages and browser-test each gate. Never write Question evidence into Card
FSRS state. No Jev in V1. The prompter requested a pause: do not resume implementation until asked.
