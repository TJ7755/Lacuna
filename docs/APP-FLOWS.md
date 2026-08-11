# Lacuna UI flow catalogue

Reviewed 11 August 2026.

This is a catalogue of the user-facing flows in the app, including the normal path, alternate entry points, empty and recovery states, duplicated paths, contradictions, and features implied by the interface but not implemented.

The review is based on the current source and the app served from localhost:5173. The T3 preview reported the tab as available and loaded, but its snapshot, wait-for, and direct DOM-evaluation calls timed out in this session. That is a preview-client limitation, not evidence that the app or browser automation is broken. Permission-dependent browser controls were therefore not re-tested in this run. Findings from older repository QA records are labelled as prior QA rather than presented as current browser evidence.

The review was read-only. The only file changed for this work is this document.

## Status language

- **Source-confirmed** — the route and behaviour exist in the current code.
- **Reachable but weak** — the flow exists, but its entry point, wording, or recovery is poor.
- **Contradictory** — the UI, help text, settings, or route model disagrees with another part of the app.
- **Implied but absent** — the product language suggests the capability, but there is no user-facing flow for it.
- **Prior QA** — recorded in an earlier walkthrough and not re-verified against the live preview in this review.
- **Permission-dependent** — the flow depends on a file picker, camera, folder permission, PWA installation prompt, or similar browser capability.

## 1. Product model and boundaries

The current product model is:

- A **course** contains lessons, notes, cards, assessments, and practice nodes.
- A lesson can contain ordinary cards, generated sequence cards, generated occlusion cards, and linked cards from elsewhere in the same course.
- The app still contains legacy **deck** terminology in internal routes, exports, help copy, and database compatibility code. Users create courses, not decks. The legacy route /deck/:deckId redirects to the dashboard.
- An assessment is either the automatically-created final assessment or a user-created checkpoint. The interface calls the latter a checkpoint.
- A practice node is either automatic, calculated from course progress, or manual, placed by the user on the path.
- The app is local-first. Data is stored in IndexedDB in the browser. There is no account, login, password reset, cloud sync, or hosted collaboration flow in the web UI.
- Electron exposes an additional session-only MCP settings surface. It is not a browser account or synchronisation service.

The absence of accounts is intentional in the current implementation, but it creates several implied-but-missing flows documented below.

## 2. Route inventory

| Route or route family | Surface | Main flows |
| --- | --- | --- |
| /welcome | Landing page | First-run introduction, demo interactions, create first course |
| /method | Technical explainer | Interactive explanation of the scheduling method |
| / | Dashboard | Course list, resume study, archive, create, import |
| /deck/:deckId | Legacy redirect | Redirects to the dashboard |
| /settings | Global settings | Appearance, input, navigation, study defaults, shortcuts, backups, import/export |
| /search | Full search | Search courses, lessons, notes, and cards |
| /share | Share and import | Publish, export, QR, share-code import, update lineage |
| /analytics | Global analytics | Cross-course forecasts, recall, study volume, leeches |
| /help | Help | Linked documentation, shortcuts, gestures, study and authoring guidance |
| /course/:courseId | Course path | Path, assessments, practice nodes, course summary |
| /course/:courseId/lesson/:lessonId | Lesson view | Notes, cards, lesson study, lesson authoring |
| /course/:courseId/bank | Question bank | Course cards, grouping, bulk operations, batch authoring |
| /course/:courseId/cards/new | New course-bank card | Card authoring |
| /course/:courseId/cards/:cardId/edit | Edit course-bank card | Card editing |
| /course/:courseId/lesson/:lessonId/cards/new | New lesson card | Card authoring with lesson ownership |
| /course/:courseId/lesson/:lessonId/cards/:cardId/edit | Edit lesson card | Card editing with lesson return path |
| /course/:courseId/lesson/:lessonId/sequence/new | New lesson sequence | Sequence authoring |
| /course/:courseId/lesson/:lessonId/occlusion/new | New lesson occlusion | Diagram upload and region authoring |
| /course/:courseId/sequence/new | New course sequence | Sequence authoring |
| /course/:courseId/sequence/:sequenceId/edit | Edit course sequence | Sequence editing and deletion |
| /course/:courseId/occlusion/new | New course occlusion | Diagram upload and region authoring |
| /course/:courseId/occlusion/:occlusionId/edit | Edit course occlusion | Occlusion editing and deletion |
| /course/:courseId/settings | Course settings | Course metadata, scheduling, lessons, practice nodes, assessments, deletion |
| /course/:courseId/analytics | Course analytics | Course forecast, lessons, stability, review volume |
| /course/:courseId/updates | Update review | Accept or reject incoming shared-course changes |
| /course/:courseId/study | Course study conductor | Lesson study, recurring practice, custom nodes, assessment revision |
| /course/:courseId/learn | Course practice session | FSRS practice, filtered study, session report |
| /lesson/:lessonId/learn | Lesson session | Simple lesson study |
| /learn | Global Today session | Cross-course FSRS session |
| any unmatched route | Not found | Branded recovery page with Back to dashboard |

The app shell wraps most routes. Welcome, Method, course study, and Learn mode deliberately use a reduced or different shell.

## 3. First-run and application-start flows

### First visit

1. The app opens IndexedDB and runs migrations.
2. It requests persistent storage where the browser supports it.
3. It records the lesson view-mode migration and starts the daily-backup check.
4. On a genuinely empty first run it redirects to /welcome before seeding the example course.
5. The landing page can seed the welcome course once, open the dashboard, or run the one-card demo.
6. On later visits the app opens the dashboard with the stored local data.

### Welcome page

The landing page contains several separate interactive demos rather than one linear onboarding wizard:

- Create your first course. This opens the application and seeds the welcome example once.
- Try one card first. This demonstrates card creation/study without committing the full onboarding path.
- Adjust the exam-date slider. This changes the landing-page demo horizon, not a real course setting.
- Explore grading and predicted exam-day change.
- Explore path nodes, locked and unlocked nodes, practice, and checkpoint skipping.
- Open the Method explainer, Help, Settings, GitHub, or the dashboard.
- Toggle smooth scrolling.

There is no account creation, profile setup, sync choice, notification permission flow, or guided real-course setup.

### Startup failure and loading

- Initialisation shows a branded Lacuna loading state.
- Lazy route loading shows a skeleton.
- Initialisation failure shows “Lacuna could not start” and a Reload action.
- Route-level and study-level error boundaries provide a recovery surface rather than leaving a blank page.

## 4. Application shell and navigation flows

### Desktop and mobile shell

- The desktop sidebar contains Dashboard, Search, Share, Analytics, Settings, and Help.
- Course rows show readiness counts, course navigation, and lesson rows for multi-lesson courses.
- The sidebar can be collapsed and the choice is stored locally. Below the compact-width threshold it becomes an icon rail.
- On mobile, the hamburger opens a drawer; the close button, backdrop, and Escape close it.
- The drawer can show archived courses if enabled in Settings.
- The title bar contains Electron window controls only when the Electron API is present. There are no browser window controls.
- Theme switching is available in the sidebar footer and Settings.
- The sidebar can reorder and hide primary navigation items, but it prevents hiding all of them.
- A new course form is available from the sidebar and dashboard.

### Global keyboard and command flows

- Ctrl/Cmd+K opens the command palette.
- / opens the full Search page when focus is not in a text field.
- ? opens the keyboard-help overlay.
- The command palette searches the same broad object types as Search, supports arrow-key navigation and Enter, and closes with Escape or the backdrop.
- The Search sidebar item opens the command palette, not /search.
- The default sidebar has no visible Today or Learn item even though /learn exists.

### Missing and awkward shell paths

- Search has two parallel surfaces: the command palette and the full Search page.
- The global Today session exists at /learn but is not a normal visible navigation item.
- A normal multi-lesson Lesson view has a back-to-course action but not the course tabs. The user must return to the path before reaching Question bank, Analytics, or Settings.
- The single-lesson course view is rendered inline inside the course route. It has a Settings icon and Add lesson, but still does not expose the complete course-tab navigation.

## 5. Course lifecycle flows

### Create a course

1. Choose New course on the dashboard or the sidebar.
2. Enter a required course name.
3. Press Enter or choose Create.
4. Escape, Cancel, or the backdrop closes the form.
5. The app creates the course and an initial “Lesson 1”.
6. The app navigates to the new course.

Validation and recovery:

- A blank name is rejected with “Enter a course name before creating the course.”
- While saving, the button changes to Creating….
- Course creation has no exam-date field.
- The data layer gives a new course a default final exam date seven days after creation, at 23:59 local time. The user has to discover Course settings to change it.

### Import a course while creating

1. Open New course.
2. Switch from Create new to Import share code.
3. Paste an LAC0–LAC3 code.
4. Read the code.
5. Review the course, lesson, card, assessment, and omitted-media summary.
6. Cancel or choose Add to my courses.
7. The imported course is added and the first imported course is opened.

The importer does not overwrite an existing course from this dialog. A malformed code produces a validation message or toast.

### Rename a course

- From the course path, choose the inline edit control or double-click the title.
- Type a new name.
- Enter or blur commits the change.
- Escape cancels it.
- Errors keep focus on the input.
- A locked shared course cannot be renamed.
- Course Settings also contains a Course name field.

This is two edit surfaces for the same property: inline path rename and Settings.

### Archive and restore a course

1. Open the course-card context menu from the dashboard.
2. Choose Archive.
3. Confirm in the archive dialog, or cancel/Escape/backdrop.
4. The course leaves the active dashboard and active study selection.
5. An Undo toast immediately restores it.
6. Archived courses can be shown in the sidebar with the Show archived courses setting.

There is no dedicated archived-course manager or persistent Unarchive action. Once the Undo toast expires, the user must find the course through the sidebar setting.

### Delete a course

1. Open Course Settings.
2. Go to Danger zone.
3. Choose Delete course.
4. The app snapshots the data, deletes the course and related data, and shows an Undo toast.
5. Undo restores the deletion while the toast is available.

This deletion is less explicit than lesson, card, and shared-course destructive actions: it does not use a blocking confirmation dialog. It is course-scoped, not account-scoped.

## 6. Course path flows

### Open and read the path

- A course card opens the course path.
- A single-lesson course renders that lesson directly inside the course route.
- A multi-lesson course shows Path, Question bank, Analytics, and Settings tabs.
- Breadcrumbs return to All courses.
- The header shows exam information, course statistics, due cards, mastery, unseen cards, and curriculum progress.
- The course title can be renamed inline in Edit mode.
- The Read/Edit toggle changes authoring visibility.
- Locked shared courses show an Editing is locked message.

### Study entry from the path

Depending on course state, the main action is one of:

- Study now.
- Review due cards.
- Review updates.
- Add cards to begin studying.
- Nothing due — study ahead.
- A Next target lesson or practice node.

Upcoming assessment pills open the assessment detail sheet. A path assessment can then start Revise for that assessment.

### Add a lesson from the path

1. Choose Add lesson, including the Add lesson control in an empty path.
2. The app proposes Lesson N.
3. Enter a non-empty title.
4. Enter commits; Escape or Cancel abandons it.
5. The app creates the lesson and navigates to it.

Lessons can also be created in Course Settings. In Edit mode, lessons can be reordered by drag/hold or with Alt+Up and Alt+Down.

### Path practice-node flows

The path shows:

- Automatic practice nodes, calculated from course state.
- Manual practice nodes, placed by the user.
- Checkpoints and the final assessment.
- Linked assessment labels such as Prioritise [assessment].

Selecting a practice node enters the course study conductor with the node identifier. Selecting an assessment opens its detail sheet or assessment revision flow.

Manual nodes can be added in path gaps at the beginning, between lessons, and at the end. The plus controls appear on hover, focus, and touch, then open the Practice node editor.

## 7. Exam date and assessment flows

### Change the final exam date

1. Open a course.
2. Open Course Settings.
3. Open Assessments.
4. Edit the automatically-created Final exam.
5. Change its name if desired, date/time, placement, coverage, exclusions, and confirmation.
6. Save.

The final assessment is created automatically with the course. There is no Add final assessment action.

### Add a checkpoint

1. Open Course Settings and Assessments.
2. Choose Add checkpoint.
3. Enter a name.
4. Set the date and time.
5. Choose a path position: before the first lesson or after a lesson.
6. Choose coverage:
   - Everything so far, a prefix of the path.
   - Choose lessons, a custom set of lessons.
7. Optionally search and exclude cards.
8. Resolve validation issues.
9. Confirm that the placement and scope have been checked when the editor requires author confirmation.
10. Save or cancel.

Checkpoint editing uses the same editor. Checkpoints can be deleted; the final assessment cannot be deleted. The editor rejects invalid local date-times, including nonexistent daylight-saving transitions.

### Inspect an assessment

- Open an assessment from the path or an upcoming-assessment pill.
- The detail sheet shows date, coverage, exclusions, and validation.
- Close with Close, Escape, or the backdrop.
- Choose Revise for [assessment] to open the revision-plan flow.

### Assessment gaps

- “Add exam date” is not the visible label. The user must find Add checkpoint or edit Final exam.
- A course can have only one final assessment and there is no user flow to create a second final assessment.
- Assessment creation is not available directly from the path; it is nested in Course Settings.

## 8. Lesson flows

### Open and switch lesson mode

- Choose a lesson on the path or in the sidebar.
- In Read mode, notes are read-only and cards show study summaries.
- In Edit mode, notes and cards can be created, edited, reordered, linked, imported, or deleted.
- The lesson header supports inline lesson rename in Edit mode.
- Locked shared lessons cannot be edited.

### Add and manage notes

1. Open a lesson in Edit mode.
2. Choose Add note.
3. Enter a name and Markdown content.
4. Save or cancel.
5. Existing notes can be expanded/collapsed, edited, reordered up/down, or deleted.
6. Delete uses an inline Delete? confirmation.

Read mode presents notes in a read-first view with collapsible sections and a notes intro before cards in a simple lesson session.

### Add a card to a lesson

When a lesson has no cards, the empty state offers:

- Add your first card.
- Add a sequence.
- Add an occlusion.
- Link existing cards.

When it already has cards, the section exposes New occlusion and the card list exposes:

- New card.
- New sequence.
- Link existing cards.
- Import.

The different placement of New card and New sequence between empty and populated states is functional but inconsistent.

### Link existing cards

1. Choose Link existing cards.
2. Search the course’s ordinary unlinked cards.
3. Select one or more.
4. Choose Link N cards.
5. The cards appear in the lesson while retaining their original scheduling history.

The dialog has an already-linked empty state and a no-search-results state. Removing an exposed linked card requires confirmation because it resets teaching progress.

### Lesson card operations

For ordinary cards, the card list supports:

- Expand/collapse analytics.
- Hover back preview.
- Edit.
- Delete.
- Flag/unflag.
- Resume or suspend scheduling.
- Import.
- Bulk selection and operations.

Generated sequence and occlusion cards are read-only for content and deletion from the card editor. Their owner links back to the sequence or occlusion editor. Scheduling actions remain available.

## 9. Card-authoring flows

### Choose a card type

New card entry points are available from the question bank, lesson empty state, lesson card list, and course-bank empty state. The editor supports:

- Front / Back.
- Cloze deletion.
- Basic reversed.
- Numeric answer.
- Working.
- Audio.

The editor can save to the course bank or directly to a lesson. The origin state returns the user to the bank or lesson that launched it.

### Basic front/back

1. Enter front and back content.
2. Use Markdown, maths, and images through the editor.
3. Add tags.
4. Optionally choose Also create reverse.
5. Save, Save and add another, or Cancel/Done.

Editing a basic reversed pair updates its reverse partner. The UI still represents the pair as separate generated records rather than one two-sided entity.

### Cloze deletion

1. Enter text.
2. Select an answer and use the Cloze action to create a deletion.
3. Optionally show a revealed-answer preview.
4. Save when at least one cloze exists.

### Numeric answer

1. Enter the question.
2. Choose an accepted-answer rule: exact, within tolerance, or matches one of.
3. Enter the value or values.
4. Check the live mathematical expression validation.
5. Save.

There is no visible variable-definition authoring flow in the numeric editor.

### Working and mark schemes

1. Enter the question.
2. Build a mark scheme with lines and criteria.
3. Compile and preview it.
4. Test an answer.
5. Optionally use pinned fixtures.
6. Save.

The app can produce a clipboard prompt for a draft mark scheme, but there is no integrated model call.

### Audio card

1. Upload or replace an MP3, M4A, MP4, Ogg, WAV, or WebM file up to 25 MB, or record from the microphone.
2. Enter the optional prompt and answer.
3. Save.

Autoplay and playback speed are controlled in global Settings. File and microphone access are permission-dependent.

### Draft, duplicate, and validation behaviour

- Card drafts are saved locally and can be restored or discarded when the editor reopens.
- Duplicate warnings appear for likely duplicate content.
- Invalid fields show validation errors and an error animation.
- Ctrl/Cmd+Enter performs quick capture.
- Editing generated cards opens a read-only preview and an owner edit link.
- Missing owner data is an error state.

## 10. Sequence flows

### Create or edit a sequence

1. Choose Create new sequence from the question bank, lesson card area, or course path authoring control.
2. Enter a required name and optional description.
3. On creation, select a preset:
   - Ordered list.
   - Poetry / verse.
   - Script / dialogue.
   - Speech / presentation.
   - Procedure / checklist.
   - Timeline.
4. Add ordered items.
5. Optionally add chunks and labels.
6. Set the cue window.
7. Optionally generate label-to-value cards.
8. For speaker presets, choose the learner’s speaker and mark speakers on each item.
9. Review the live generated-card preview.
10. Save or cancel.

Each item can have a speaker, label, chunk, and Markdown content. Items can be inserted below, moved up/down, or deleted. Ctrl/Cmd+Enter adds the next item.

### Paste a scripted sequence

For speaker presets:

1. Open Paste script.
2. Paste lines in NAME: line format.
3. Split into lines.
4. Review the editable speaker/content preview.
5. Remove unwanted lines.
6. Use these lines or go back/cancel.

Lines without a recognised speaker are skipped. There is no equivalent general paste/import flow for non-speaker sequence types.

### Sequence deletion

- In edit mode, the Danger zone deletes the sequence and its generated cards.
- Deletion is recoverable through an Undo toast rather than a full blocking confirmation.
- Opening an existing sequence and replacing its items can warn that study progress will be reset.

The sequence editor does not auto-scroll to a newly-added item. Prior QA also recorded sequence preview/badge and blank-submission problems; those observations were not re-run against the current live preview and should be treated as regression checks, not current conclusions.

## 11. Occlusion flows

### Create or edit an occlusion

1. Choose Create new occlusion from a lesson, question bank, or course path.
2. Enter a required name.
3. Upload a diagram image.
4. Choose Draw label box, Draw feature, or Select.
5. Drag regions over the diagram.
6. Select each region and set its role.
7. For features, optionally pair them to a label box.
8. Add answer text where needed for typed responses.
9. Optionally add a note shown on the back.
10. Review the generated-card count.
11. Save or cancel.

Editing an existing diagram can prompt “Regenerate every card in this occlusion?” because replacement changes all generated cards. The editor requires a name, image, and at least one region. It permits an unpaired feature when answer text is available, but the learner-facing consequence is not explained clearly.

### Occlusion deletion

- The Danger zone deletes the occlusion and generated cards.
- An Undo toast can restore it.
- Generated cards are read-only in the ordinary card editor.

Image selection is permission-dependent. The split editor has a desktop-oriented minimum width, although pointer drawing supports touch input.

## 12. Practice-node flows

### Add a manual practice node from the path

1. Switch the course path to Edit mode.
2. Choose the plus control at the start, between lessons, or at the end.
3. Enter an optional name; the default is Practice.
4. Choose Start of course or After lesson.
5. Choose lesson sources, or choose none to include all lessons.
6. Optionally set a positive card limit.
7. Choose whether to randomise order.
8. Save.

The node appears on the path. Selecting it launches the course study conductor.

### Add or edit a manual practice node from Settings

1. Open Course Settings.
2. Open Content and Practice nodes.
3. Choose Add practice node, or edit an existing manual node.
4. Use the same name, position, lesson scope, limit, and randomisation fields.
5. Save, cancel, or delete with the inline Delete? confirmation.

This is a second full authoring path for the same object. The editor component is shared, but the entry point and context are different.

### Automatic practice

Automatic nodes are calculated from study progress and thresholds. They appear when relevant on the path, but they are not listed or edited in the Practice nodes settings list.

The data model supports card filters, but there is no builder for saving or editing those filters in the UI. The current manual-node form only exposes lesson scope, card limit, and randomisation.

## 13. Question bank and batch-authoring flows

### Browse the question bank

- Open Question bank from course tabs.
- Search all course cards.
- Cards are grouped by lesson and Unassigned.
- Open a lesson bucket or edit a card.
- Generated sequence and occlusion cards are grouped under their owners.
- Course-bank empty state offers Create new card, Create new sequence, and Create new occlusion.
- Lesson buckets can import and bulk-manage cards; available create/link controls differ by bucket.

### Import cards

1. Choose Import from a card list.
2. Paste text, choose a file, or drag and drop.
3. Let the app detect CSV, TSV, Markdown table/list, JSON, plain text, or choose a format manually.
4. For an Anki APKG, review the parsed preview including scheduling history and media.
5. Review duplicate counts and row/character limits.
6. Choose Add cards.

Limits are 5,000 rows and 500,000 characters. The standard card-list importer does not expose share-code import; share-code import is a separate course flow.

### Bulk card operations

1. Enter select mode.
2. Select ordinary unlinked cards, or Select all/Deselect all.
3. Apply Tag add/remove, Suspend, Resume, Bury until tomorrow, Reschedule, Move to another deck, Assign to lesson, or Delete.
4. Complete the operation and use the Undo toast where offered.
5. Choose Done to leave select mode.

Generated and already-linked cards are excluded from ordinary bulk selection. Touch mode exposes actions through swipe trays.

### Create a batch prompt

1. Choose Generate batch.
2. Enter lesson notes, topic, and level.
3. Optionally set concepts per item and maximum items.
4. Copy the generated prompt.
5. Run it manually in an external chatbot.
6. Return to Review response.
7. Paste the delimited response.
8. Choose the target lesson and review the parsed candidates.

### Review and accept a batch

- Candidates are marked Valid or Needs attention.
- A likely duplicate warning can appear.
- Each candidate can be accepted, edited, rejected, or revised with an external AI prompt.
- Clean items can be accepted individually or with Accept all clean.
- Rejected items can be restored.
- Batch revision supports a complaint, copied revision prompt, pasted revised reply, and position-based Apply revisions.
- Accepted cards are created in the target lesson.

There is no integrated AI call, persistent staging area, saved prompt history, batch export, or explicit Reject all. Closing the dialog loses the staged batch.

## 14. Study and learning flows

### Course study conductor

Course study starts at /course/:courseId/study and persists an active-flow identity so the dashboard can offer Resume.

The entry query determines the first branch:

- review=due starts recurring due-card practice.
- practiceNode=[id] starts a manual or automatic node.
- assessmentId=[id] starts assessment revision setup.
- No query lets the planner choose the next lesson or practice step.

The planner can show:

- Choose what to study when a lesson and an upcoming assessment compete.
- Continue with the next lesson.
- Revise for a named assessment.
- Done.
- Course not found.
- Course archived.
- Lesson still locked.
- Course empty, with Add lesson.
- You are caught up.

After a lesson, practice, or revision step, the transition screen can offer Continue next step, Take or defer a break, Review due cards, Finish, or Done. Assessment revision does not mark a curriculum Practice milestone complete.

### Revision-plan flow

1. Start Revise for an assessment.
2. Review the assessment date and coverage.
3. Choose a daily time budget: 10, 20, or 30 minutes, or a custom 1–480 minutes.
4. Create the plan or edit future days.
5. Start or resume today’s window.
6. Study the ranked cards.
7. Leave and resume later; the plan is persistent.
8. Review the completed report of covered, improved, parked, and not-reached material.

The setup shows a read-only completed or archived state once the plan is complete or the exam has passed. It can show model-ranked scheduling or ordinary Practice fallback when model data is invalid.

### Learn mode entry points

- /learn is a global Today session across courses.
- /course/:courseId/learn is course Practice.
- /lesson/:lessonId/learn is Simple lesson study.
- The course conductor also launches lesson-scoped Simple learn and course-scoped practice.
- Valid filtered-study query parameters can select due, new, leeches, flagged, suspended, or other filtered subsets.
- A mode=simple query can force simple mode. A mode=cram query is not a general cram launcher; assessment revision is the current cram-like path.

### Lesson-first session

1. Enter a lesson session.
2. Read the lesson notes intro.
3. Choose Continue.
4. If the lesson has no cards, the lesson can still be marked complete.
5. Work through the cards.
6. Finish at the Session report.

### Card session

1. The header shows menu, title, progress, Pomodoro, card actions, Focus Mode, fullscreen, and Exit.
2. The card front appears.
3. Reveal with a tap, Space, Up, or Show answer, or enter a typed answer.
4. In typed mode choose Check answer; in reveal mode self-grade.
5. Silent grading uses Yes/No. Manual grading uses Again, Hard, Good, Easy.
6. Use keyboard, touch buttons, or card gestures.
7. Audio cards can replay with R. Sequence line hints use H where available.
8. Card actions can edit, flag, bury, suspend, or show shortcuts.
9. Edit opens a paused in-session card overlay.
10. Finish through the session limits or choose Exit.

Machine-marked numeric and working cards use their own answer checker and dispute/report history rather than the classic self-grade face. Unsupported payloads show a read-only unsupported-item face.

### Touch, focus, and interruption

- Touch uses a bottom sheet for Show answer, grading, and card actions.
- The card can flip/reveal and swipe left or right for silent answers.
- Focus Mode hides controls until the top edge or Show study controls is used; Escape leaves Focus Mode.
- The Pomodoro timer can request a break and offer to take or defer it.
- An interrupted course flow is resumable from the dashboard.
- The route-driven Learn mode Done action returns to the course or lesson origin.

### Session report

The report can show Goal reached, Time limit reached, Daily limit reached, or Session complete. It includes:

- Before/after mastery or objective.
- Cards reviewed.
- Accuracy.
- Mean response time.
- Focus.
- Grade distribution outside simple mode.
- Distractions.

Actions include Done and, where limits permit, Keep studying or Continue anyway. Simple mode presents a reduced report and can restart its queue.

## 15. Search flows

### Full Search page

1. Open /search or use the slash shortcut.
2. Search courses, lessons, notes, and cards.
3. Filter by Due now, New, Leeches, Flagged, or Suspended.
4. Clear filters or the query.
5. Open the result to its course, lesson, note, or card editor.

Empty and no-match states are present.

### Command palette

1. Choose Search in the sidebar or press Ctrl/Cmd+K.
2. Type a query.
3. Navigate results with Up/Down.
4. Press Enter to open a result.
5. Escape or the backdrop closes the palette.

The palette and full Search page are overlapping implementations rather than one search surface with two presentations.

## 16. Analytics flows

### Global analytics

Open /analytics to inspect:

- Course comparison.
- Next-30-day due/new forecast.
- Predicted exam-day score.
- Prediction accuracy using Brier score.
- Review volume over 30 days.
- Study time over 30 days.
- Observed recall by card age.
- Leech count by course.
- Stability profile.

These views are read-only and have empty states. Archived courses are excluded from the active global view.

### Course analytics

Open the Analytics course tab to inspect:

- Predicted exam-day score.
- Lesson breakdown.
- Card stability profile.
- Review volume.

There are no editing or planning actions inside analytics; the user has to return to the path or settings to act on what the charts show.

## 17. Sharing, publishing, importing, and updates

### Publish and export a course

1. Open /share.
2. Select a course.
3. Choose Publish course for a new shared lineage or Publish update for an existing lineage.
4. Generate a share code.
5. Copy the code or generate a QR code.
6. Optionally export the course as plain text.

Share codes support LAC0–LAC3 compatibility. Share codes do not carry media; the UI warns that images, audio, and diagrams are omitted or represented by text fallbacks. Full backup is the media-preserving route.

QR generation fails when the encoded text is over the QR capacity. Camera scanning requires permission and has Start/Stop scanning and error states.

### Import a shared course

1. Paste a share code into /share or the New course import form.
2. Read the code.
3. Inspect the summary and omitted-media warning.
4. Cancel or Add to my courses.

An invalid code produces an error message or toast.

### Receive and merge an update

When a shared lineage has an incoming revision:

1. Open Review updates from the course path.
2. Inspect Updates, Removals, and Conflicts.
3. Expand a row to compare Current and Incoming.
4. Choose Accept/Take theirs or Keep mine as appropriate.
5. Use Review later or Accept all from the fixed action bar.

The panel shows a no-updates/up-to-date state and can report automatic changes. There is no obvious per-decision undo in the review panel.

### Shared-course lock and detach

- Shared copies can be locked against editing.
- Course Settings can enable automatic acceptance of updates.
- Danger zone offers Detach course.
- Detach confirmation makes the copy independently editable; future lineage updates no longer apply.

## 18. Global settings flows

### Appearance and input

Settings changes are immediate:

- Dark, Light, or Auto theme.
- Accent colour.
- Text-size scale.
- Animation speed.
- Keyboard first, Touch first, or Auto input mode.

### Sidebar and dashboard

- Show ready counts.
- Show archived courses.
- Compact sidebar.
- Reorder or hide primary nav items.
- Reset navigation defaults.
- Dashboard sort: Recently studied, Ready for review, Lowest mastery, Soonest exam, Name A–Z, Created recently.
- Dashboard progress metric: Curriculum progress, Card coverage, or Today’s workload.
- Hover detail for next review, breakdown, and recent activity.

Settings text says the top three active courses are shown, but the current dashboard renders all active courses. This is a direct copy/behaviour contradiction.

### Study and scheduling defaults

- Manual four-point grading or silent Yes/No.
- Reveal answer or type answer.
- Lenient, standard, or exact typed-answer strictness.
- Audio autoplay and playback speed.
- Start Learn sessions in Focus Mode.
- Global scheduling optimisation default.
- Auto-insert practice and far/near/revision/max-gap thresholds.

### Keyboard shortcuts

The default registry includes:

- Ctrl/Cmd+K palette.
- / search.
- ? help.
- Space answer.
- Down hide.
- Y/N silent grading.
- 1–4 manual grading.
- E edit.
- F focus.
- U undo.
- Up reveal.
- Left/Right silent answer.
- R audio replay.
- H sequence line hint.

Click a shortcut row, press a key, then click outside or press Escape to cancel. Reset restores defaults. The current UI does not expose a visible conflict-resolution workflow when two actions are assigned the same key.

### Pomodoro

Set Focus, Short break, and Long break durations and Auto-start breaks. The timer is also available from study headers.

### Installation and local storage

- Install PWA is shown only when the browser supports the install prompt and the app is not already installed.
- Windows users may be directed to GitHub releases.
- The app can request persistent storage and reports whether it was granted or denied.

### Import and export

Global Settings exposes:

- Full backup JSON, including courses, cards, review history, images, and other local data.
- CSV.
- TSV.
- Markdown table.
- JSON array.
- Plain text.
- Review-history CSV and JSON.

Export creates a download or text output depending on the format. Settings does not expose the Share code format even though the shared export component supports it; share-code generation is separate under /share.

Import from file accepts a JSON backup:

1. Choose a file.
2. Review lesson, card, and date counts.
3. Cancel, Merge, or Replace all.
4. Merge uses the most recently updated record.
5. Replace all deletes current local data and restores the backup.

Replace all is destructive and the preview is the main guard; it does not use the same explicit confirmation pattern as some other destructive flows.

### Automatic backups and restore

- Back up now.
- Review the ten most recent restore points.
- Automatic once-daily backups.
- Mirror to a folder when supported.
- Choose a folder or Stop mirroring.
- Delete an individual restore point.
- Restore a point after confirming Replace all data?.

Folder mirroring is permission-dependent and unavailable in browsers without the relevant file-system capability. There is no one-click Delete all local data flow separate from replacing data with an import or deleting courses individually.

### Electron-only MCP settings

Only in Electron, Settings can show connected MCP clients and session-only scope permissions. The user can grant, upgrade, downgrade, or revoke access. This is not present as a browser flow.

## 19. Help and Method flows

### Help

Help is a hash-linkable documentation page covering:

- Courses and lessons.
- Study modes.
- Filtered study.
- How to study.
- Keyboard shortcuts.
- Touch gestures.
- Progress and scheduling.
- Card types.
- Sequences.
- Diagrams.
- Tips.

The right-hand section navigation tracks the current section. Footer links return to Settings, Analytics, Method, or Dashboard.

Current copy mismatches:

- Help describes global Today as available, but the default sidebar does not expose a Today entry.
- Help says course settings contain import/export, while the current import/export controls are global Settings.
- Some terminology still says deck where the main UI says course.

### Method

The Method page is an interactive technical explanation with draggable charts and sections for:

1. Naming correction.
2. Model line.
3. Weights.
4. Scoring and loss.
5. Fitting.
6. Test.
7. Results.
8. Handover.

It links back to the dashboard, welcome page, and help. It is explanatory, not a setup or configuration flow.

## 20. Empty, blocked, error, and recovery states

| State | User-facing behaviour | Recovery |
| --- | --- | --- |
| App initialisation failure | Lacuna could not start | Reload |
| No courses | Empty dashboard | New course or import |
| Archived course hidden | Course absent from active dashboard | Enable archived courses in sidebar settings |
| No lessons | Empty path | Add lesson |
| No cards | Lesson/question-bank empty state | Create, sequence, occlusion, link, or import |
| No search matches | Search empty state | Clear query/filter |
| No due cards | Nothing due — study ahead | Study ahead or return |
| Course empty on study | Cannot start normal curriculum | Add lesson |
| Course archived on study | Nothing available | Return to course/dashboard |
| Lesson locked | Study cannot advance | Return later or change unlocking settings |
| Course caught up | You are caught up | Finish or study ahead |
| Missing course/lesson | Not-found recovery | Back to dashboard/course |
| Missing card owner | Authoring error/read-only fallback | Return to owner or leave editor |
| Invalid share code | Error message/toast | Correct code or cancel |
| QR too large | Capacity error | Use copy/text or smaller payload |
| Camera unavailable | Scanner error or permission block | Stop scanning/use pasted code |
| File chooser unavailable | Import/upload cannot proceed | Use pasted text or another browser |
| Folder permission unavailable | Mirroring cannot start | Export a backup manually |
| PWA install unsupported | Install control absent or explanatory state | Continue in browser |
| Invalid assessment scope | Validation issues | Change placement, coverage, exclusions, or confirmation |
| Nonexistent local date-time | Date/time error | Choose another local time |
| Stale shared update | Latest-revision message | Close; no merge |
| No pending updates | Up-to-date state | Return to course |
| Empty batch response | Parse/review error | Paste a delimited response |
| Unknown batch item kind | Candidate cannot be accepted | Edit or reject |
| Invalid sequence | Save error/validation | Add valid items and values |
| Empty occlusion | Save disabled | Upload an image and add a region |
| Restore/import replace | Destructive preview | Cancel or confirm replace |

## 21. Redundant paths and contradictions

| Area | Repeated or conflicting surfaces | Usability consequence |
| --- | --- | --- |
| Naming | Course in the UI; deck in legacy routes, exports, help, and some copy | Users cannot tell whether deck and course are different objects |
| Search | Full /search page and Ctrl/Cmd+K command palette | Two search behaviours to learn |
| Course name | Inline path rename and Course Settings field | Same edit in two contexts |
| Lesson creation | Path Add lesson, empty path Add lesson, and Settings lesson management | Several entry points with different navigation outcomes |
| Practice nodes | Path gap plus controls and Settings Practice nodes section | Same object has two authoring flows |
| Cards | Bank header, bank empty state, lesson empty state, populated CardList, and card routes | New card is not consistently in the same place |
| Generated content | Sequence/occlusion controls vary between lesson and bank buckets | User may assume a missing control is unsupported |
| Import | Share page, New course share-code import, global backup import, and CardList text/APKG import | “Import” does not mean one thing |
| Export | Global formats versus Share page formats; Share code is hidden in global Settings | Users must know which page owns which export |
| Study | Study now, Review due cards, Practice node, course Learn, lesson Learn, and global Today | Entry labels overlap but use different queues and reports |
| Settings saves | Course settings commit immediately; card/sequence/occlusion editors use explicit Save | Save expectations change by route |
| View mode | Path Read/Edit, Lesson Read/Edit, and Course Settings lesson view mode | Three places control related presentation state |
| Assessments | Add checkpoint exists; final assessment is only editable | “Add exam date” is not a discoverable operation |
| Practice visibility | Auto nodes appear on the path but are absent from Practice node management | Automatic and manual nodes look like one system but are managed differently |
| Navigation | Multi-lesson course tabs exist only on the path; normal Lesson view has no tabs | Moving from a lesson to bank/settings takes an extra step |
| Destructive actions | Course deletion uses Undo, lesson deletion uses inline confirmation, restore uses Replace all confirmation | Risk signals are inconsistent |
| Dashboard copy | Settings says top three courses; dashboard shows all active courses | Documentation and behaviour disagree |
| Help | Help says course settings hold import/export; controls are global | Users are sent to the wrong page |
| Today | Help and route imply global Today; default navigation omits it | Existing feature is effectively hidden |

## 22. Broken, fragile, or unverified flows

### Current source-backed findings

- The create-course flow hides the exam-date decision and silently supplies a seven-day default. A user asking to create a course and set its exam date must complete two separate flows.
- There is no user-facing Add final assessment flow.
- There is no persistent archived-course management screen or obvious Unarchive action.
- Manual practice nodes have no UI for the stored card-filter model.
- Global Today exists but is not discoverable in default navigation.
- Course Lesson views lack direct access to the course tabs.
- Card and generated-content creation controls move between empty states, section headers, and list headers.
- Global export and Share export overlap while exposing different formats.
- Help contains stale location and terminology claims.
- Dashboard settings text contradicts the current list rendering.
- Course settings commit on change or blur with no Save changes action, while other authoring surfaces train the user to look for Save.
- Occlusion editing permits unpaired features with an optional typed answer, but the consequences of that choice are not made clear.
- Shortcut editing has no visible conflict-resolution state.
- There is no direct one-click Delete all local data action; deletion is per-course or part of a replace/restore operation.

### Prior QA findings, not re-verified on localhost:5173 in this review

The repository’s older manual walkthrough recorded the following regressions or usability defects. They should be treated as regression-test candidates, not current live claims:

- Sequence generated-card badges and first-preview wording were confusing.
- Blank sequence submission was previously silent.
- Some sequence authoring fields lacked clear labels.
- Some status/toast messages were announced more than once.
- A mobile Settings layout previously clipped a text-size control.
- Some landing-page copy and demo labels were inconsistent.
- Camera scanning, file-picker imports, folder mirroring, PWA installation, and fullscreen permission paths were blocked by the test environment.

The current source contains fixes for several earlier route, share-code, help, and settings-accessibility issues recorded in the browser audit. Those earlier defects are not repeated here as current failures.

## 23. Implied but non-existent flows

The interface, product language, data model, or help implies these capabilities, but there is no corresponding user-facing web flow:

- Account creation, login, logout, password reset, profile, or account deletion.
- Cloud sync across browsers or devices.
- Shared live collaboration with user identity and permissions.
- A first-class deck creation or deck-management workflow distinct from courses.
- Add final assessment.
- A saved filter builder for custom practice nodes.
- A visible global Today launcher in the standard navigation.
- Integrated AI generation from the batch prompt dialog.
- Persistent batch drafts, prompt history, batch export, or a staging inbox.
- General paste/import for all sequence presets, rather than speaker-script paste only.
- DOCX, PPTX, or image-batch ingestion. The current batch importer is text, structured text, JSON, or APKG.
- Parameterised generated practice instances and shared skill/template identities.
- A structure-aware equation editor.
- LLM-graded scheduling.
- A unified two-sided card object editor for reverse pairs.
- Media-preserving share codes. Media requires full backup.
- A dedicated archive manager and long-term unarchive action.
- A separate delete-all-local-data control.
- A browser MCP connection-management flow. MCP settings are Electron-only.

These are boundaries of the current product, not implementation instructions.

## 24. Short end-to-end scenarios

### Create a course, add an exam date, and study

1. Dashboard → New course.
2. Enter a name → Create.
3. Course path → Course Settings.
4. Assessments → edit Final exam.
5. Set date/time → Save.
6. Content → add lessons and cards.
7. Return to Path → Study now.
8. Complete lesson study, practice, or revision.
9. Review the Session report.

The missing shortcut is a single creation wizard that asks for the exam date at course creation.

### Create a custom practice node

1. Course path → Edit.
2. Choose a plus gap control.
3. Set name, position, lesson scope, limit, and randomisation.
4. Save.
5. Choose the node on the path.
6. Complete or exit the resulting study session.

Equivalent alternate entry:

1. Course Settings → Content → Practice nodes.
2. Add practice node.
3. Configure the same fields.
4. Save and return to the path.

### Publish a course and receive an update

1. Share → select course → Publish course.
2. Generate and copy the LAC share code.
3. Another user pastes it into Share or New course import.
4. The recipient reads the preview → Add to my courses.
5. The publisher changes course content → Publish update.
6. The recipient opens Review updates.
7. Compare Current and Incoming.
8. Accept, keep, or defer each change.

Media is not carried by the share code.

### Back up, delete, and restore

1. Settings → Import & export → Full backup JSON, or Automatic backups → Back up now.
2. Course Settings → Danger zone → Delete course.
3. Use Undo while available, or Settings → Automatic backups → Restore.
4. Confirm Replace all data?.

There is no account-level deletion or cloud restore.
