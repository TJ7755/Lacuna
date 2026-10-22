# Lacuna — version 0.2.15

## Unreleased

## 0.2.15 beta — redesigned study and authoring

- Cancel the card editor’s delayed post-save return when the editor closes or changes cards, so leaving for Settings cannot be redirected back to Cards. (#389)
- Recalculate virtual card-list ranges when surrounding content changes size, keeping off-screen lessons bounded before the learner scrolls. (#389)
- Load Quick search on demand whilst retaining first-use offline support, keeping launch assets within budget. Update redesign validation for the current landing page, import flow and settings disclosures, and include live peer-merge recovery tests in the coverage gate. (#389)
- Simplify the Study session preview to the course, next steps and card counts, one total time and Start session. Remove numbered badges, repeated timings and duplicate Cancel actions; keep alternative study choices behind Other ways. (#389)
- Forms, Markdown editors, Quick search and AI composition ignore input-method composition keys and respect shortcuts already consumed by nested fields. (#436)
- Inline confirmations keep Escape and Ctrl/Cmd+Enter within the decision, returning focus to their available opener on cancellation without advancing the underlying question-set editor. (#440)
- Card-entry Tab shortcuts fall back to native traversal when a disabled or missing target cannot receive focus, preserving the valid repeat-save loop. (#438)
- Working-card study keeps its answer field focused on entry and after moving to the next card, without selecting a departing inert field or changing marking and study pacing. (#436)
- Typing in a text field now gives a soft accent glow that fades as you type, without moving text or caret. (#437, #478)
- Extend rapid Card entry to the retained Numeric, Working and Audio editors: direct Tab paths, invalid-field focus, useful audio attachment/repeat focus and fresh Working checker state. Preserve native traversal for incomplete drafts, leave microphone activation explicit, guard pending saves and retain failed drafts for retry. (#438)
- Keep Numeric Card entry focused on the current answer after an animated change of answer check, without requiring another edit. (#438)
- New individual Questions require an explicit primary Concept choice instead of silently using the first Course Concept; editing, restored drafts and repeat entry retain deliberate choices. (#439)
- Individual Question validation focuses the first invalid numeric answer or tolerance through the shared editor ref and reports invalid generated-family settings beside the relevant field, retaining input and keyboard save behaviour. (#439)
- Individual Question editor: the prompt and answer now lead, with name, lesson and Concepts after; a new Question opens in its prompt; Ctrl/Cmd+Enter saves, and Save & add another keeps the lesson, Concept, form and tags for the next one; missing fields are reported at the field with focus on the first instead of a toast (#439).
- Make Question Set attempts fluent from the keyboard: Ctrl/Cmd+Enter advances answers and explicit self-marking decisions, task focus follows saved progress, and secondary tools retain unfinished notes and corrections. Restore submission focus when cancelling unanswered parts without overriding focus moved during a pending save. Simplify single-part navigation and place manual marking before annotations on narrow screens. (#441)
- Sequences: in a script recited in chunks, the cue before a chunk's first line now belongs to that chunk, so each new line is presented with its own cue rather than a later one; the active answer is kept in view as recitation lines reflow; the sequence editor's action bar no longer makes the page scroll sideways at 320px with Larger text, and Add sequence stays on one line (#442).
- Sequences: Tab from the last item's content once again focuses Add sequence or Save changes. Enter still adds an item and Ctrl/Cmd+Enter saves the sequence; backward Tab and unavailable save targets retain native navigation. Input-method composition, including legacy key-code 229, leaves focus and the event's default untouched (#442).
- Sequence acceptance now explicitly preserves blank-scaffolding omission with all-empty validation and paste insertion at the selection, superseding historical row-invalidation and whole-script replacement-warning criteria; external human and native-platform gates remain tracked by #456 (#442).
- Diagram authoring keeps focus after deleting a region, lifts focused fields clear of the action bar, keeps that bar inside the page at narrow widths, and names region roles as Label and Feature instead of lbl and ftr. (#443, #474)
- First content and blocked study: a new course opens with focus on New card; the study sheet offers Add cards for an empty course, names a locked lesson with what unlocks it, and no longer calls an archived course locked; the Add menu describes Lesson, Card practice, Practice questions and Checkpoint; Help describes the Study sheet as it is, names Progress correctly, and its shortcuts table scrolls within itself instead of clipping on narrow screens (#444).
- Today: only courses with something to study show a Study button, and only the lead one is filled. Courses with no cards say "No cards yet", courses with nothing due say "Nothing due", and "Done for today" now appears only after studying that day. The S shortcut studies the course whose button leads (#445).
- Lesson outline: Add lesson selects its suggested name so typing replaces it and offers Create & add another (Ctrl/Cmd+Enter) to build an outline without leaving the course; Settings rename now selects the name, saves once, ignores blank or unchanged names and stays open after a failed save, like the lesson header; Add practice questions submits on Ctrl/Cmd+Enter; checkpoint exclusions list readable card text instead of raw cloze, maths and Markdown (#446).
- Settings: Pomodoro durations, practice-node defaults and days between lessons no longer jump to their minimum when cleared. They save on Enter or blur, Escape restores the saved value, and an empty or out-of-range entry stays unsaved with its bounds shown (#447).
- Reject shortcut assignments that collide with fixed study/search/help aliases or another binding irrespective of letter case; modified keys no longer become plain shortcuts, composition remains untouched, and invalid saved assignments fall back per action. (#447)
- Search lists equally good matches in natural order ("Item 9" before "Item 10") instead of an arbitrary one, and arrowing past the shown results now scrolls the newly shown result into view. (#448)
- Search content now supports typing, arrows and Enter with visible selected results, matching excerpts and live counts. Quick search offers See all results beyond its 40-result cap; full search keeps query, Card filters, expanded results and scroll context when returning from a result. (#448)
- Label Current and Incoming merge-review versions and compare all content fields, including changed card backs, additions, removals and unchanged context. Keep decisions and their consequences clear, retain keyboard focus after resolving rows, announce completion and recover failed applies. Move wrapping bulk actions into the page so mobile course navigation cannot cover them. Preserve the existing atomic merge, lineage and review-history behaviour. (#449)
- Device pairing starts on the recovery phrase or pairing details, with private relay configuration grouped under Advanced. Validation and pairing failures stay beside the value to correct, cancellation restores the setup choices, and successful pairing focuses Show pairing QR or Sync now. Saved pairings and encryption are unchanged. (#450)
- AI approvals lead with the proposed action, its target and consequence, with the raw tool name moved under Technical details. (#451, #475)
- Give question-set loading, missing and read-only routes a consistent page frame, and retry failed draft or attempt reads without losing saved work. (#452)
- Recovery: the error screen now focuses its heading and leads with Try again, with the raw error and diagnostic copy/download under Technical details and a visible message when copying fails; it no longer animates with reduced motion. Pasted import text survives a trip back to All sources, and shared-course import shows unreadable codes, course files and failed imports as an inline alert that stays until the next attempt instead of a passing toast (#452).
- Progress date labels no longer collide on narrow screens with larger text, and the exam-day score explains how it averages courses and shows a single day's value instead of an empty state. (#453, #476)
- Progress explains the stability profile, observed recall and leech charts in plain terms, and the leech chart links straight to the leech cards. (#453)
- Give the AI header's Disconnect and Sign out link a 44px pointer target without changing its look. The merge review expander and image occlusion role buttons already met the standard. (#454, #473)
- Cards and Archived: Tag… now focuses its tag field, and a finished bulk action returns focus to Select instead of dropping it; restoring an archived course offers Open in its confirmation without navigating, and the empty Archived page offers Back to Today (#455).
- Make the sticky course bar audit wait for course Settings to load before scrolling, so it no longer races the page. (#456, #477)
- Record the redesign coverage matrix, candidate-specific evidence and outstanding novice, native-input and device validation gates. (#456)
- Give repeat-save its own padded row, keep Cancel and Done at stable bounds, and reserve the added-card tally. Compact touch actions retain editor space and follow the visible viewport above mobile keyboards; answer mode and reverse creation form a consistent responsive group, and card formatting uses the existing expandable toolbar. (#457)
- Settings reflows with its own text-size setting on narrow screens: segmented controls stack their options vertically when they cannot fit side by side, and the audio playback speed and grading strictness choices wrap beneath their labels, so nothing overflows its card or squeezes the grading explanation into a narrow column (#458)
- Opening a landing page link such as `#landing-product` on a first visit now stays on the landing page instead of booting the study dashboard (#503)
- Dark mode keeps the near-black ground with the Volt neon foreground retained, so banner edges and icons stay defined while light mode is unchanged (#537)
- Removed the redundant Claude instruction file and completed AI gateway implementation plan; current agent and contribution policies remain authoritative. (#548)
- Added the validated, read-only exam specification catalogue format with tier, route, paper, assessment objective and command word support; no entries ship yet (#550).
- Recover a sticky failed lazy-route import by reusing the shared stale-chunk recovery: after the first guarded reload the failing route re-runs the origin probe and clears service-worker and cache state before reloading again, so settings and other routes open on redelivered preview deployments (#560).
- Fixed Anki package imports failing because the web and desktop security policies blocked the bundled SQLite WebAssembly reader, including after an upgrade from a cached worker. JavaScript string evaluation remains blocked. (#565)
- Primary button labels now meet 4.5:1 contrast for every alternative accent in both themes, keeping the selected accent colours unchanged.
- Repeated Enter presses cannot create duplicate lessons while creation is pending. Reopening Add lesson before its closing animation finishes refocuses the name field.
- Prune duplicated implementation documentation and retired redesign reports, preserve unresolved acceptance evidence in its owning issues, add a small source index, and check documentation links/fragments in required CI. Add isolated browser verification with per-run assets and source/evidence records.
- Closing the AI conversation immediately disables its departing controls while preserving the window exit animation, rapid reopening and the existing quick-search interaction guard.
- The review calendar now follows Progress’s 7-, 30- and 90-day selector, with matching dates, totals and labels. Short periods use compact calendar cells, and changing period preserves a reachable keyboard tab stop while clearing outdated details.
- Removed browser hover URL previews from in-app navigation controls, including sidebar entries, course tabs and back controls. Keyboard navigation, active highlights and modified-click destinations are preserved; external links and downloads keep native link behaviour.
- Closing a course archive confirmation immediately disables its departing controls and focus trap while preserving the visual exit; reopening during that exit restores confirmation focus.
- Restoring an archived course keeps keyboard focus on the next restoration action, or the page heading when the list becomes empty. Archived uses the shared page-title scale and spacing.
- Update the production audio-playback regression to use the redesigned Edit mode and Path navigation and scope playback to the authoring player within Card content, retaining real WAV playback, persisted audio reload and CSP assertions.
- Desktop releases are now automatic after the version bump merges. `bun run release:prepare <version> [title]` bumps `package.json`, folds the changelog and pins the Windows upgrade gate to the previous release's installer digest (now in `scripts/windows-release-baseline.json` rather than three files). Once CI and Security pass on master, the new Release tag workflow tags the commit and dispatches the release build, which publishes the beta itself when `docs/releases/<version>.md` holds its notes.
- Course analytics: the Lesson breakdown's slanted lesson names no longer run off the axis and lose their first words; long names end in an ellipsis, and the tooltip and data table keep them whole.
- Update browser checks to follow the delivered authoring, navigation, disclosure, search and study controls while retaining focus, geometry, recovery and synchronisation assertions.
- Show named browser test and retry starts in CI logs and preserve per-attempt JSON timings alongside the existing HTML reports and failure evidence.
- Use Bun 1.4.3's built-in checker for the web project references, retaining native TypeScript for smaller server/Electron checks and desktop emission; align development, CI, audits and release builds on Bun 1.4.3.
- Improve the date and time picker with continuous keyboard date navigation, month and year paging that preserves the focused day, a left-aligned month label with adjacent navigation arrows, and one today shortcut that preserves the chosen time.
- Keep Import cards visible beside More in the New card editor, as a separate rounded button outside the card-type selector.
- Card kinds read the same everywhere ("Front / back", sentence case), and the course Cards list names reversed, audio, numeric and occlusion cards instead of calling them all "Front / Back".
- Card list rows clamp their question and answer by line rather than by pixel height, so a fraction in an answer is shown whole instead of clipped, and a cut-off line ends in an ellipsis.
- Revealed cloze answers no longer carry horizontal padding left over from their old highlight fill, which read as a space before following punctuation ("H2O .").
- The flag, edit and delete buttons on a card-list row are now 44 by 44 pixels; they were 32 pixels wide, below the spec's touch-target minimum.
- Keep the card-save announcement regression focused on the live Saved message alongside the new added-card counter.
- Cards: the list is redesigned as slim rows. Each shows the question, its answer beneath, and when the card next comes up (New, Due, Later today, Tomorrow, In N days), replacing the hover flip to the back and the stability figure.
- Image-occlusion cards show their diagram with the asked region marked, and the region's answer, instead of the word "Occlusion" and a repeated question; they list in region order.
- The Cards page holds every lesson in one panel, and on wider screens each lesson's heading stays in view while its cards scroll.
- On phones the question takes the full width: Flag, Edit and Delete move into the opened row (and the swipe tray), instead of reserving space beside every card.
- Analytics charts now refresh their colours when the accent changes or an automatic theme follows the system.
- Run CI on pull requests into long-lived `redesign/**` branches, not only master, so stacked redesign work is tested before it lands.
- Fit text and Anki imports into compact input, review and destination steps without a scrolling panel. Preserve drafts and reverse-card settings when going back.
- Centre Search content and use the shared rounded search-field styling.
- Progress’s 7- and 30-day review activity now fills the card with a compact daily strip, with matching weekday or date labels and sequential keyboard navigation. Longer periods retain the calendar layout.
- Fix the public comparison card demo's hydration error when reduced motion is enabled, retaining its interactive controls and motion preference.
- Component tests now cover the sync pairing flow (setup, manual and QR join, validation and failure paths), the touch card-actions sheet (actions, keyboard and drag dismissal), and the staged item editor and candidate row (field edits, fixtures, validation and AI revision)
- Inline confirmations preserve focus deliberately restored by their caller when cancellation chooses the next action, including lesson-deletion cancellation in Settings.
- Unified Add and Other ways around one expanding action surface, preserving fixed-size text and the original corner-anchored spring. Action menus support arrow keys, Home, End and Escape, skip unavailable entries and restore focus on dismissal.
- Contain inline confirmations in rounded panels with existing semantic colours, grouped destructive and Cancel buttons, and narrow-width wrapping. Preserve neutral permission prompts, focus return and reduced motion; prevent repeat submission while returned promises are pending.
- Clarify study actions, course controls, revision plans and device sync with contextual helper text.
- Keep the interface responsive during backup asset encoding by yielding after bounded amounts of byte and metadata work, preserving the existing backup data and restore behaviour.
- Counts read naturally everywhere they are shown: "1 card" rather than "1 cards" on Path rows, import, practice settings and the study progress bar, with thousands grouped ("5,002 cards"). One shared helper replaces three local copies.
- Keep the course colour audit pointer clear of content before navigation, so a valid hover colour cannot falsely fail the mobile resting-colour checks.
- The course bar (sections and View / Edit) now stays at the top while a course page scrolls, as intended; it used to scroll away because its sticky parent was only as tall as the bar.
- Report course-deletion snapshot and storage failures through the existing error toast, retain the confirmation for retry, and prevent duplicate deletion while pending. Cancelling returns focus to Delete course.
- Fixed the Path heading sitting lower than its sibling course sections: the course header now inherits spacing from the shared page frame without conflicting padding utilities.
- The course-menu keyboard browser regression waits for the persisted Edit mode to appear before traversing its controls, retaining its exact forward and reverse focus assertions.
- Course and lesson workspaces now enter with one restrained fade once their core content is ready. Creating a course preloads its destination modules and reuses the course snapshot for its single lesson, avoiding repeated reads and staggered page assembly.
- Keep the opening course Study or Other ways panel above the closing panel throughout their transition.
- Redesigned course settings around editable study-goal, daily-workload and target-recall cards, with compact expandable rows for secondary settings and confirmed archive/delete actions below. Existing save rules, validation and final-exam editing links are preserved.
- Fixed course settings disclosure headers shifting and scaling when opened or closed with a pointer or keyboard, retaining their existing layout, hover feedback, chevron and body motion.
- Clarify course settings hierarchy with spacing and modest indentation instead of separators between disclosure rows and above Advanced practice timing.
- Course bar: the View/Edit switch uses the compact pill size, so its track is the same height as the section tabs beside it; both keep a 44 pixel target.
- Cards: the other ways to add (beside New card, and on each lesson group) are the same unframed 44 pixel round control as every other overflow menu, not wider framed ovals.
- The course page's Assessments card shares the Lessons card's padding and heading size, so the two headings sit on one line; the forecast legend now starts on the chart title's edge.
- Fixed repeated course titles after a course loads: persistent navigation now observes titles that arrive asynchronously and hides its duplicate while the page heading is visible.
- Course title editing replaces the previous title immediately while animating the incoming control, preventing overlapping headings and retained rename fields. Escape returns keyboard focus to Rename.
- Kept course-title visibility tracking attached to the header while renaming, so the persistent course name no longer reappears beside the inline editor.
- Move the course name between the Path heading and persistent course navigation when changing sections within the same course, including reverse navigation and asynchronously loaded headings. Entry from Today and reloads show the title in place. Keep single-line titles together during travel, without clipping trailing words from wrapping headings, and hide departing endpoints until the overlay settles. Preserve the course identity for inline single-lesson courses and honour reduced motion.
- Stop custom-covered lessons that sit after their assessment, after reordering, from feeding practice and exam-date targeting. Thanks to nc-3388 (#503).
- Keep ranking revision cards when some cards in the pool have no memory-model history, serving those cards in objective order instead of dropping the whole session to ordinary Practice. Thanks to nc-3388 (#503).
- Create daily restore points in a worker so large media backups do not stall study, preserving snapshot contents, throttling, protected restore points and offline operation.
- Dashboard course menus and archive confirmations remain available on their first use offline, while retaining deferred loading during application startup. Production browser coverage checks keyboard operation and focus restoration without a network connection.
- Restore Today's documented right-click, context-menu key and Shift+F10 course actions through the existing visible menu, sharing native text-editing protections with lesson actions without adding database code to the dashboard.
- Load the Today queue's course menu and archive confirmation on demand, keeping first-load JavaScript within its budget.
- Verify Today's delayed loading placeholder against a controlled clock, retaining both its 250ms delay and immediate-load suppression without depending on test-machine load.
- Today course menus announce their expanded state, dismiss on Tab without interrupting native keyboard navigation, and provide a 44px Archive target. Archiving returns focus to the next course action or Today heading without overriding another chosen control.
- Find cards in the current lesson with Ctrl/Command+F or the search button beside its cards. It opens the Quick search dialogue narrowed to the lesson's cards; Course Cards uses the same shortcut and search matching, while Quick search remains global.
- Load embedded-image import processing on demand while keeping its first offline use and database transactions safe.
- Add Settings (Cmd/Ctrl+,) and Keyboard Shortcuts to the desktop app's native menus, routed through one whitelisted menu-command channel that replaces the Help-only channel.
- Reduce development tooling resource use by excluding generated artefacts from Vite's watcher and limiting the relay, handwriting maths and AI MCP test suites to one worker each.
- Corrected Help’s diagram-sharing instructions to point to course files, which retain diagrams and media. Full backups remain the option for moving every course and its study history.
- Course settings name the assessments card ("Assessments"), matching every other settings card and the Path's side panel.
- Condensed the Direction C next-session brief into the visual design and accessibility specifications and removed the finished plan.
- Bring Markdown diagrams, syntax highlighting, enlarged images, note editing and annotations into Direction C using theme-aware colours, shared fields and pill controls. Animate image viewing, diagram source and chart data with shared motion helpers that honour motion speed and reduced motion; remove duplicate image captions.
- Course creation now expands from New course on Today, keeping the current page visible and returning keyboard focus after cancellation. The sidebar shortcut opens the same form; validation is preserved. New courses, from the form or an import, default to Steady retention, so a name alone is enough to create one; Exam date remains one click away.
- Today course rows lift immediately on hover or keyboard focus, without inheriting their arrival delay.
- Expanding action menus and course creation use one physical spring, with consistent damping across motion speeds and instant expansion for reduced motion.
- Add lesson uses the same expanding disclosure motion; Escape works throughout the form and restores focus to its trigger.
- Lead an empty lesson with New card alone, leaving out the empty management panel and the irrelevant Answer by control, and disable Study on a one-lesson course that has nothing to study.
- The sidebar ring and a lesson's "Exam in N days" count calendar days, so an exam a week away reads 7, not 8: exams sit at 23:59, and part-days had rounded up.
- Today's sharing announcement reads "Explore sharing" again; the two words had lost their space ("Exploresharing").
- The exam-day forecast's title keeps to the top of its card, level with the legend's first row, instead of sinking as the legend wraps.
- A course whose exam is 100 or more days away no longer runs its day count into the sidebar ring.
- Card rows no longer show a faint red tint at their right-hand corners: the swipe tray behind each row now appears only while the row moves.
- Course settings' Lesson unlocking options line up as a list again; each radio had taken a text field's full-width styling and the three options scattered across the card.
- Course settings no longer tells every course it is "managed by its author": the Shared course section and its Detach button appear again only on a locked shared copy.
- Course settings' Scheduling optimisation card is headed like its neighbours, without the small "Advanced scheduling" label above it.
- Progress: Workload ahead draws each day's due and new cards as stacked bars, so a course of all-new cards no longer spikes a line against the axis.
- Course analytics: Lesson breakdown plots only mastery and completion; each lesson's card count moves to its tooltip ("Cell structure · 25 cards") instead of a dotted line on a hidden second scale. Chart tooltips list series in legend order rather than alphabetically.
- Settings and course settings label every field one way, small semibold ink with a regular hint beneath, where some sections used grey regular labels and others semibold. Selects, the Pomodoro and threshold inputs share the text field's frame, and course settings' fields focus in the accent like the rest.
- Progress: Course comparison's two pickers share one even row instead of each stretching to its longest course name and wrapping.
- Dialogs (lesson deletion, card editing, assessments, linking cards and the rest) use the borderless card surface of Quick search instead of an outlined paper panel.
- Assessment, new-course and date fields follow the same label rule; the assessment editor's Coverage and lesson choices use the Settings choice chips instead of outlined orange buttons, and the date picker, course-name field and card search share the text field's frame.
- The Welcome course's forgetting-curve and sample-image drawings follow the theme in the Direction C palette instead of sitting in fixed dark stone panels, for existing Welcome courses too. They are swapped in when displayed (`src/db/seedArtwork.ts`), so upgrading rewrites none of a user's records; the 0.90 label no longer runs off the drawing's edge.
- The app declares its theme's colour scheme, so native scrollbars and select menus match a manually chosen theme rather than the system's.
- Study works the same everywhere: Today's course rows say **Study** (not Start) and open the same session plan as the course page, with the same button styles; a one-lesson course offers the course page's Study and Other ways rather than its own Review due cards button; Other ways names due review **Only review due cards**, as the session plan does. Large buttons are 48px, level with the full-size menu beside them.
- Link-styled buttons (Back to Today, Create a course on Today, the date picker's Done, the storage error's Reload) take the shared Button classes (`buttonClassName`). Reload had named a colour that does not exist and stood 36px tall.
- New question set leads with + like New card and New course.
- On a phone, a course path's lesson counts drop beneath the lesson name instead of squeezing it until words break mid-word ("Biologic al") in Edit mode.
- The sidebar names its search entry **Search content**, as the page it opens, the Welcome course and the shortcuts sheet already did.
- On a lesson of a multi-lesson course, the action that starts that lesson directly is named **Study lesson**, so **Study** always means the course's session plan.
- Bring Direction C up to date with the shared UI primitives, session completion and continuous Practice. Shared cards and inputs retain the redesign styling, while dialogs and loading states use the common implementations. (#389)
- Add a Lesson actions menu (Rename, Move up, Move down, Delete lesson) to each lesson on the course path and to the lesson heading in Edit mode, also opened by right-click, the context-menu key or Shift+F10. Deletion states what is removed and kept, then offers Undo.
- Replace the single-lesson course's row of stretched creation buttons with the shared Add menu, which sits in the lesson header beside Study; the new-lesson form opens in its own bounded area on single- and multi-lesson courses, and Escape returns focus to Add.
- Name the two kinds of path practice consistently as Card practice and Practice questions.
- Let menu triggers grow with enlarged text instead of clipping their label.
- Give keyboard and assistive-technology activations the shared press feedback, and show content immediately when motion is disabled.
- Make sidebar entries consistently open pages, keep study actions on Today, align Archived with course names and remove horizontal sidebar overflow.
- Support drawing, moving and resizing diagram regions with a keyboard, preserve normal editor Tab order, and focus sharing results after their actions complete.
- Remove repeated descriptive editor captions and align editor heading sizes with Direction C pages.
- Record the next Direction C session's priorities: expanded lesson controls, discoverable lesson management, consistent menus and outstanding verification.
- Aligned course-section headings, spacing and content frames; Course Settings now fills its shared content column. Settings and Help share their heading rhythm, section rail and card surfaces, with the same keyboard-accessible section jumper on smaller screens.
- Path practice stops are announced to screen readers as Card practice, and Help uses the current terms (Card practice, the single-lesson Add menu, lower-case "cards").
- Course pages gain a **Progress** tab (Path · Cards · Questions · Progress · Settings) for the course's analytics, which had no tab and no way back; the forecast figure in the course header is plain text. Course Progress drops its separate Predicted exam-day score chart, which the exam-day forecast above it now covers.
- Redesign, "Direction C" (core loop). The app now uses a stone paper ground,
  white surfaces and navy ink, with Bricolage Grotesque for display type and
  Atkinson Hyperlegible Next for reading, both bundled for offline use (OFL).
  Buttons are pills, and the sidebar sits on a darker `--chrome` ground with a
  white active pill that glides between items. Amber stays the default accent,
  and the landing page keeps its own palette.
  - The dashboard is now "Today":
    - today's card and minute totals;
    - an exam-day forecast chart (`fsrs/courseForecast.ts`), with each course's
      outlook to its exam on a proportional date axis against the target;
    - the streak, this week's reviews and the days studied this week;
    - the courses ordered by urgency, each with Start and an archive menu.
  - The outlook is the exam-day forecast as it would stand on each day if the
    schedule is kept, simulating Good reviews whenever recall falls to the target.
    It never falls, so the chart has no sawtooth.
  - The week figures come from the compact review-activity timestamps, because
    the dashboard must not read full review records.
  - The course card grid, the review heatmap and the seven-day study-signals
    strip are no longer on the dashboard.
  - Study: the card keeps one quiet surface in every mode, with no outline or
    tinted halo. Every fifth correct answer in a row pops a "5 in a row" badge
    with a confetti burst.
  - The session report counts its figures up and bursts for a good session.
  - Course sections stick to the top as a frosted bar with pill tabs.
  - Every animation follows the motion-speed setting and is skipped when motion
    is off.
  - The workspace mode reads View / Edit (formerly Study / Author mode), so it no
    longer shares a word with the Study button beside it.
  - The sharing announcement appears on Today only, and drops its illustration on
    phones, so it no longer pushes each page's work below the first screen.
  - Every page shares one content frame and a stable scrollbar gutter, so titles
    start on the same edge everywhere; the home page is called Today in every
    link and message.
  - Removed on-screen repeats: the Import page's second title and close button,
    the Questions entry in Other ways (the Questions tab already opens it), the
    New question button above an empty list, the course name placeholder, and
    the "Scope is valid" line in assessment details (shown only when a scope
    needs review).
  - Empty states point to the next step: Questions in View mode offers to switch
    to Edit, and the sidebar says "No active courses" when some are archived.
  - Today's minute total never reads 0 while cards are due.
- Redesign, "Direction C": the rest of the app.
  - Settings and Your data:
    - borderless cards that rise in, and sliding pill segmented controls;
    - round accent swatches;
    - springing switches (`Toggle` is now the single pill-switch implementation);
    - a backup hero with a busy state and a tick, and restore points with a
      confirmation modal;
    - another device as one slim row that opens pairing in a modal.
    - Back up now no longer reports a save that the five-minute throttle
      skipped.
  - Lesson and card editor:
    - the lesson opens on its title, one meta line and a sliding View/Edit pill,
      with the note as a reading card beside its cards;
    - the editor pairs the form with a live flip preview and pops a tick on save;
    - `MarkdownEditor` gains `hidePreview`, so the editor shows one preview, not
      two.
  - Cards and course settings:
    - Cards: counted filter chips and a floating bulk-action bar.
    - Course settings: one readable column with a big target-recall figure and
      presets, beside the shared section rail (a jump menu on narrow screens).
  - Questions:
    - The Individual questions bank, now behind the question set library, is a
      card grid with the last five results, the record, and marks with typical
      time.
    - Practice has segmented progress, highlighted generated values, New numbers
      for generated families, and a result that pops or shakes.
  - Analytics:
    - a period switch and counting headline figures;
    - the review heatmap with a diagonal fade-in;
    - calm restyled charts that draw in when scrolled into view;
    - the course page opens with its own exam-day forecast.
    - `StudySignals` was removed.
  - The assistant is a draggable floating window that folds to its header or
    closes to a pill, so it no longer resizes the page.
  - The maths answer field is restyled.
  - Import and sharing:
    - Import has a stepper whose connector fills, and a review count that counts
      up.
    - Sharing has a Copy button that confirms with a tick.
  - Phone:
    - Today fits narrow screens.
    - Study has a round Exit, "n of N" over a springing progress bar, a round
      Undo and thumb-zone No/Yes buttons.
- Redesign, "Direction C": fidelity pass against the boards.
  - Sidebar:
    - reads Today, Search (with its shortcut) and Progress;
    - gives each course a ring glyph (days to the exam, forecast fill, today's
      load as dots, infinity without a date);
    - lists Archived after the courses, and moves Share, Settings and Help to
      its foot;
    - shrinks its rows to fit the window, tightening further on short windows
      with a fine pointer, so it never scrolls.
  - The keep-to-schedule forecast is computed once in the shared course data
    and cached per course (`state/dashboardForecasts.ts`). Today, the sidebar,
    the course header and the course bar therefore agree, and a review only
    recomputes its own course.
  - Course page:
    - opens on the course name, one line of facts, Study with today's count,
      and an animated Other ways menu;
    - shows a numbered lesson list with states and progress bars beside
      assessment date tiles;
    - Practice Qs stops sit in the lesson list as rows that open the set
      directly, with an Edit button in Author mode, replacing the side detail
      panel;
    - the course bar shows the course's status dot and name;
    - the Analytics tab is gone, because it duplicated Progress; course
      analytics opens from the forecast figure.
  - Study header: Exit pill first, the course with "n of N" over the bar, Undo
    at every width, and a round card-actions trigger.
  - Settings lays out with the title above and the section rail on the left;
    the shared rail uses the white pill.
  - The shared `Menu` fills its trigger, turns its chevron and staggers its
    items, and its items can carry a second line.
  - Card rows lead with the front, with a quiet meta line beneath.
- Every control now acknowledges a press: buttons, links, tabs, menu items and
  switches sink slightly and spring back (`pressFeedback.ts`), following the
  motion-speed setting.
- No more all-caps labels: every small capitals label is now a sentence-case
  label, and the eyebrows above headings (Course study, Revision plan, 404,
  Connection, MCP access request, Final exam passed) are gone; the final-exam
  dialog now leads with "Final exam passed". `src/designRules.test.ts` keeps
  capitals out.
- Share is redesigned around one default:
  - it opens on a course (the requested one, else one already shared, else the
    first active course), with a menu beside the title to switch;
  - the share link is the single primary action and, once live, shows the link
    with Copy, its QR code, its revision, Update link and Stop sharing;
    **Send revision n** takes over when the link is behind the course;
  - a course file, share code, QR code and plain text sit under Other ways, one
    open at a time, with the media warning only where media is dropped;
  - the numbered Course / Method / Send steps, the method descriptions and the
    import half are gone: receiving lives on Import → Lacuna course, so the
    unused `?intent=import` entry was removed.
- The course bar no longer repeats the course page's title: its course name
  fades in only once the title scrolls out of view.
- Removed descriptive captions that did no work: the editor placeholders'
  "Markdown, maths and images are supported", the tag hint, the answer-mode,
  sidebar-navigation and assessment-placement notes, the Questions empty-state
  line, "The recommended default", Help's Back to Today link, the assessment
  sheet's eyebrow (its kind now leads the date line) and its empty Exclusions.
- The lesson answer mode and the course exam objective use the shared pill
  toggle. The exam objective names both choices (Most marks, Secure topics)
  instead of a switch for one of them, with a one-line consequence.
- The study target (new course and final assessment) is one shared tile pair
  with icons and a tick, in place of two bordered native radio cards. It still
  asks for an explicit choice, so no course gets an exam date by accident.
- Settings drops the small group label above each card (the section rail
  already names it; the heading stays for screen readers). Archived courses
  use the shared card surface, and the sidebar's empty message sits where the
  courses would, above Archived.
- A lesson with one note no longer opens on an empty band in View mode: the
  note's tab and control row folds away and slides in for Edit.
- Study: the step screen's Continue keeps its arrow with reduced motion (it
  used to hide it and leave the label off-centre) and gets its press animation
  back; the notes before a lesson sit on the shared card surface.
- Top-level page titles also share one top edge: Import no longer reserves an
  empty Back row, and Progress and Help lost their extra offsets.
- Cards offers New card once, in the page header; New sequence and New
  occlusion fold into a menu beside it, and the lesson and unassigned groups no
  longer repeat the create buttons (Open lesson adds to a lesson).
- The card editor's Add card no longer wraps alone under the other actions:
  it takes the full width above Cancel and Save & add another.
- A lesson's card list no longer shows raw maths markers ($e^x$).
- More captions removed: the import panel's paragraph and scanner hint, the
  break-timer, final-exam and lesson-management notes, and the MCP intro; the
  practice note no longer points to a "Practice Now in the course header" that
  no longer exists, and Install says only that it works offline.
- Bordered "well" panels across editors, settings, study faces and the
  assistant became the borderless tinted well, and the assistant's bubbles
  drop their You / AI labels (side and colour already say who is speaking).
- The Study sheet's optional pass reads "Practise until all correct" (it was
  labelled with the mode name, Simple Learn), with Start practising.
- The course bar shows the course name alone, without the coloured status dot.
- Calmer page changes: the outgoing page leaves at once and the new one fades
  in, so two pages never overlap; course tabs drift 24px instead of sliding a
  full screen width; page sections fade in place instead of rising.
- Returning to a page puts it back where you left it: browser Back and in-app
  returns restore the scroll position (`scrollMemory.ts`), instead of every
  navigation jumping to the top.
- Dialogs now open on their first field rather than the close button, and the
  close button shows a focus ring. Escape, Ctrl/Cmd+Enter and (for single-line
  forms) Enter share one `dialogKeyDown` helper across the card editor overlay,
  New course, assessment, practice and script-paste dialogs.
- The card editor page cancels on Escape, and the shortcuts cheatsheet and
  Help page list the shared dialog keys (Esc, Enter, Ctrl/Cmd+Enter).
- Back returns you to where you were. An origin now carries the full address
  (query included) and its place in browser history, so the card editor's
  Back, Cancel, Escape and post-save return step back to that exact entry,
  scroll position included (`useReturn` in `utils/editorOrigin.ts`). Cards
  keeps its search and filters in the address (`?q=`, `?f=`), so they survive
  a trip to an editor.
- The sequence and occlusion editors return the same way, and lose their
  legacy bordered header box.
- Leaving Study (Exit, Finish) returns to whichever page opened it, Today, a
  course tab, a lesson or search, instead of always the course: the flow
  remembers where it started in history and steps back past its own entries
  (`useLeaveFlow`), falling back to the course after a deep link.
- Page shortcuts through one `usePageShortcuts` hook: S studies on Today, the
  course page and lesson pages; N adds a card on the Cards page and on a lesson in
  edit mode; / focuses the Cards search. They ignore typing, modifiers and open
  dialogs, and are listed in the shortcuts cheatsheet and the Help page.
- Keyboard-first editors: the sequence, occlusion, lesson-note, question-set and
  import flows open on their first field, save or continue with Ctrl/Cmd+Enter and
  cancel with Escape while nothing has been entered (question sets step back, as
  drafts autosave). Tab from the last text field reaches the primary action. In the
  sequence editor Ctrl/Cmd+Enter inside an item still adds the next item. The new
  `useEditorKeys` hook never stops propagation, so the shell shortcuts keep working.
- Prepare Direction C against current master, retaining redesigned editors and focus behaviour alongside the latest data-safety fixes; run Security on redesign pull requests and align all workflow Bun versions. Refresh the roadmap and record the remaining release acceptance boundaries.
- Today leads with the courses to study, so Start is visible without scrolling; the exam-day forecast and week panel follow beneath. The day's total now reads "30 cards" rather than a bare number.
- The exam-day forecast's time axis now ends at the furthest exam rather than at least a fortnight out, so a near exam no longer leaves half the chart empty. Long course names in its legend truncate instead of squeezing the title, and Today's minute estimates no longer wrap.
- Progress: the exam-day score chart follows the 7/30/90-day period like its neighbours, chart axes size to their labels (100% was clipped to 00%), and View data aligns with each card's edge.
- A lesson with cards but no notes now starts on its first card instead of an empty "No notes yet" page with a Continue button.
- A long course name now truncates beside the course section tabs instead of running underneath them. Hovering a card row no longer shows the swipe tray's buttons through it, and each lesson group on Cards keeps Select and its add menu on the heading row.
- The sidebar course list shades the edge that hides more courses, and Today's course names wrap to two lines on a phone rather than truncating.
- Text editors name their controls in words ("Maths" rather than "$x$"; Bold and Italic for screen readers), take Ctrl/Cmd+B and Ctrl/Cmd+I, and show a live preview beneath the Write tab once the text contains maths. The question editor's image button lines up with its fields and "Use separate parts" reads as a button.
- Every Study and Start action ends with the same forward arrow (the lesson page used a play icon before its label), and an empty notes card is headed Notes like the cards beside it.
- Lesson names on the course path wrap to a second line on a phone instead of truncating, and the study header's navigation button shares the framed style of its neighbours.
- Keyboard users get a Skip to content link as the first Tab stop, so reaching Start no longer means tabbing through every course in the sidebar.
- An empty Questions page says what a question set is.
- Progress fits a phone: the 30-day activity strip no longer scrolls today out of view (its last date labels no longer collide), and charts no longer push their cards past the screen edge.
- On a phone, a long course name shares its row with View and Edit, and each lesson group on Cards gives its name a full row above Select.
- Quick search highlights matches flush with the rest of the word ("Integration", not "Integ ration") and in the darker accent ink for contrast.
- Help uses the current names (Card practice, Practice questions) and no longer says question sets never appear on the course path; an empty Archived page says where archiving happens.
- An empty lesson in View mode offers Switch to Edit to add cards, as the Questions page already did.
- First load is about 5.7 KB (gzipped) lighter: the welcome course's content now loads only while its seed or one-off asset repair is still pending, and the service worker precaches it for offline starts.
- Sidebar course names wrap onto a second line instead of truncating after a dozen characters; compact mode still truncates.
- The exam-day forecast shows how much you would recall on exam day if you stopped now, rather than assuming every card is reviewed on time and answered Good: an unstudied course reads 0%. The chart traces that figure over recent days up to today, with the exam marked ahead and nothing projected; Today, the course page, course analytics and the sidebar ring all use the same figure. Settings → Dashboard → Forecast range sets the window (2 weeks, Month or 3 months, today 60% across).
- A course's Study button has a ring beside it showing the reviews due today, filling as they are done and completing with a tick, instead of a count inside the button. The exam date, forecast and card count under the course title move into one compact card beneath the lessons (exam-day recall, cards, lessons); Assessments keeps the date.
- The session plan opens as the shared centred dialogue from tablet width up, and on a phone its handle now swipes the sheet away (it had looked draggable and did nothing). Opened from a course page it no longer repeats the page's Other ways.
- Direction C now uses Volt: charcoal and lime with Space Grotesk headings and Instrument Sans body text. Dividers, default course accents and Welcome drawings carry a restrained green tint; readable accent text and focus rings adapt to light and dark mode. Both fonts are bundled and precached for offline use.
- Saved amber changes to Volt once; other accents and saved theme choices are preserved. Fresh installs open in dark mode, and Amber remains available in Appearance settings.
- Missing-course, missing-lesson and missing-record states in sequence and diagram editors now retain the shared page frame and full-size Back controls, preserving each original return destination.
- The Windows desktop package budget is now 19 MB and 700 files, up from 14 MB and 600, to fit locally bundled Mermaid diagrams. CI's Windows upgrade job now runs the package check on every pull request, so a release build is no longer the first place it can fail.
- The not-found page and the empty Archived page use the shared card surface; the first had kept an outlined, shadowed box and the second a ruled line under the title, and the not-found page's button loses its shadow like every primary button.
- Keep recently visited course paths live, prefetch likely course routes during idle time, and share course navigation data across tabs. Course and lesson loading now use one delayed skeleton beneath persistent navigation, with a minimum visible lifetime. Today uses the same timing policy, and the sidebar waits for resolved data before showing an empty state.
- Align the flat-card browser checks with the removed sharing announcement while retaining every surface assertion.
- Direction C cards and panels use a single theme-token hairline border without drop shadows across every accent in light and dark. Interactive card boundaries retain non-text contrast; the study card and sharing banner keep their existing behaviour.
- Today's exam-day forecast chart now loads on demand, keeping start-up JavaScript under its budget.
- Exam-day forecast lines are coloured by course rather than status, so several on-track courses no longer draw identical green lines; the legend now says On track or Behind beside each course. (#490)
- Spotlight the highest exam-day forecasts first, with matching chart colours and legend order; keep remaining courses as faint context.
- Today: with many courses, the exam-day forecast colours and labels only the three most urgent; the rest stay faint behind a "more" toggle until chosen. Today's percentages match their line's colour and no longer cover the chart.
- Help now presents its Settings, Analytics and scheduler destinations directly, removing a redundant descriptive footer caption and decorative icon while retaining the links and their keyboard targets.
- Fixed duplicate keyboard targets in Help's footer: each destination is now one accessible link with the shared press feedback and a full-size touch target.
- Replace dense Help reference sections with short, searchable task questions in Settings-style cards, arranged in two fixed columns on wide screens. Rank direct answers first, share customised shortcuts and show up to three Help results in Quick search and Search content. Update guidance for grading, scheduling, exam dates and revision.
- Help now recognises topic links inside the app’s hash route and follows topic-fragment changes. Help and Settings share the existing validated section-link handling, including encoded fragments and listener cleanup.
- Keep the Import heading anchored while its panel expands by focusing inline inputs without scrolling the surrounding surface.
- Import now expands from its button into a neutral panel on Today, reusing the existing preview and confirmation flows. Existing Import links open the panel instead of a separate page.
- Fix entrance animations being suppressed for content opened after reloading the first route.
- Keep cold Import opens compact until content is ready, measure at the final width, and animate source changes, All sources and panel height together.
- The Import page’s initial paste and package steps use the full input width instead of reserving an empty destination column. Review keeps its destination and card-preview split.
- Quickly closing and reopening an Import source restores focus to its input even while the previous step animation is still finishing.
- Import: the title now sits where every other page's title does. Back (now **All sources**) shares its row on the right instead of reserving an empty row above it, so nothing moves as the steps change.
- Run the original CPU-throttled image-advance measurement in its own single-worker CI job, required alongside both functional Chromium shards and mobile smoke by `browser-smoke`. Keep ordinary local Chromium coverage and all measurement budgets unchanged.
- Replace the landing page below the hero with concise exam scheduling, forecast, grading, exam question and privacy explanations, using static product examples and a shorter FAQ.
- The sliding pills now actually slide: course tabs, View/Edit, the sidebar, settings segments and the other `layoutId` indicators jumped, because the app loaded motion's `domAnimation` features, which leave out layout animation. The full `domMax` set now loads straight after first paint (no change to first-load JavaScript, and precached for offline use).
- With layout animation live, containers holding text animate their position only, so an inline confirmation, a toast, a sidebar course row or a dialog never squashes its text while it changes size.
- Recover failed lazy-route imports with one guarded page reload, then retain the existing error boundary if loading still fails. Pre-bundle QR and Markdown dependencies to avoid late development-server optimiser generations.
- Remove the study header’s navigation button and unused session drawer; Exit returns to app navigation.
- Course settings: the leech options are ordinary radio buttons in 44 pixel rows; they had been styled as full-width text boxes, which also made each row too short to tap comfortably.
- Leech counts on Progress, the course comparison and the search and Cards filters now all respect each course's own leech threshold; the comparison no longer counted cards by list position.
- A lesson's card list renders each front as the Cards page does, so maths reads as maths rather than stripped notation ("e^x"); the plain text shows while the renderer loads.
- A lesson's card list matches the Cards page: each row shows the card's kind and when it next comes up, an occlusion card shows its diagram, and an occlusion's cards stay together in region order. Fronts wrap to two lines on phones instead of cutting off after a few words.
- Keep dragged lesson rows aligned with the pointer by reserving their lifted border in the resting state.
- Give lesson settings reorder controls 44px targets, the shared press animation and keyboard focus rings. Name the inline lesson editor and return focus to Rename when it closes without taking focus from another chosen control.
- Let lesson settings names, inline editors and actions wrap naturally at narrow widths and enlarged text, preventing names collapsing and reorder controls overlapping rename actions.
- Report failed lesson rename, reorder and deletion writes through the existing error notification, retaining the editor or confirmation so the action can be retried.
- Keep keyboard focus on the lesson rename or actions control after saving with Enter or cancelling with Escape, whilst preserving focus moved to another control when saving on blur.
- Make the lesson’s course link visibly navigable, move Select beside Manage, and align compact card-kind icons with schedule pills while preserving answer previews and tags.
- Exclude generated Electron companion bundles from source linting, so preparing a desktop build does not introduce third-party bundle errors into the repository lint gate.
- Configure the Linux runner's packaged Chromium sandbox helper before native interaction checks, keeping the application sandbox enabled during pre-merge verification.
- Two unit tests no longer time out under a parallel full-suite run: the backup rollback test writes a slice of its first batch instead of 2,000 rows (fake-indexeddb rolls each row back with a linear index scan), and the APKG zip-bomb test builds its archive at the fastest compression level with a longer timeout
- Recompose main Settings around Appearance, Input mode and Pomodoro cards, followed by compact expandable groups using the approved course-settings treatment. Preserve existing controls, form state and section deep links; closed groups leave the keyboard and accessibility order immediately.
- Markdown fields (the card editor's Front and Back, notes and the other editors) show focus on their whole frame, like every other text field, instead of a ring drawn around the text area inside it.
- Markdown images without alt text are named "Image" instead of announcing their file name, so a linked image's link always has a name; an enlargeable image's button already names it. A test now covers opening and closing the image viewer from the keyboard. (#494)
- Keep correct-answer radio groups separate when editing several multiple-choice questions on one screen.
- Action menus ignore attempts to open when every action is disabled and move keyboard focus to an available action when the focused action becomes unavailable.
- Tab and Shift+Tab leave an action menu in the surrounding page's normal keyboard order, retaining the trigger as the navigation origin when the focused option disappears.
- Make the quick-search keyboard shortcut replace the mobile navigation drawer and restore focus to its opener after closing.
- Keep morphing triggers at their resting size on press, including keyboard activation, so Study, menus, creation, Import and path editors expand without an initial shrink. Ordinary buttons retain their press feedback; Study also stays the same size on hover.
- Remove duplicate inner focus rings from inputs whose wrapper already provides a focus shadow, preserving the visible outer keyboard indicator.
- Reopening New course during its exit restores focus to the retained name field, without trapping keyboard navigation while the form is closing.
- Take departing note actions out of the keyboard and accessibility tree while they fade, so Add note is never announced twice.
- Close note sections continuously without pausing on a thin sliver before snapping shut; disclosure heights now use a non-bouncing spring at every motion speed. (#389)
- Associate the note editor's Title label with its field so screen readers announce it.
- In View mode a lesson with no notes no longer shows an empty Notes panel; its cards take the width. Edit mode keeps the panel, where the first note is added.
- Give selectable diagram regions accessible names and expose their selected state.
- Precache the Import route so a received course file can be opened on first use offline (about 110 KiB gzipped at service-worker install), and size menu triggers before their first paint.
- Update packaged interaction checks to open Quick search with its existing shortcut and courses through their redesigned links, and recognise the current course heading. Bound native locator waits so failed probes report the blocked action promptly.
- Start every top-level page title at the same height (Import keeps its Back row above the title), and keep the course tab's held expansion from being cancelled by the generic press dip.
- Clarified device pairing: a scanned QR lets you choose a recovery passphrase for this device, including reusing an existing phrase; manual pairing requires the phrase chosen when sync was first set up.
- Quick search highlights its rows as inset rounded rows, like every other menu, instead of full-width bands.
- Run functional Chromium CI tests across four parallel shards to reduce the browser gate's longest job while retaining isolated image performance measurements and complete browser coverage.
- Replace path-editor modals with sentence editors that bloom from checkpoint/exam, card-practice and Question Set rows, or the Add trigger, and fold back after valid edits. Add a searchable card-exclusion picker and anchored deletion confirmations. Extend the existing native drag interaction to authored path nodes, with spring displacement, edge scrolling, dependency checks and Alt+Arrow/menu alternatives.
- Keep native lesson touch listeners attached through development refreshes and allow an empty new Question Set editor to close when there are no saved sets to choose.
- Add consistent Edit, Move up/down and confirmed Delete menus to card practice, Question Set activities and checkpoints on the course path in Edit mode, aligned with lesson actions. Assessment rows also expose editing; the required final assessment remains protected.
- On a phone, a lesson page keeps Path current in the bottom section bar, as the tab bar does on wider screens and the navigation spec requires; the two bars now share one rule.
- Every button now has a 44 by 44 pixel minimum, so icon-only buttons such as Rename and Delete in course settings are no longer 40 pixels wide.
- Small pill toggles (exam objective, card preview side), the section jumper, the Insert image button, the tag box, the New course pill, the Today course names and the course forecast link all reach the 44 pixel target on a phone without changing how they look.
- A new end-to-end test probes each control's real hit area on several phone pages, so a pseudo-element that widens a target counts and a border that eats into one does not.
- The last squared buttons are pills (dialog and shortcut-sheet close buttons, card row and sequence item actions, date picker controls, import, occlusion, mark scheme, assistant and error-screen buttons), and list rows use the menu's rounded row. Today's course menu uses the shared menu surface.
- A new `hit-target` utility gives compact controls a centred 44 pixel target without changing their look; the toast Dismiss, assistant Send, date picker Now and Done, and the small import, assessment, practice and results toggles use it.
- `src/designRules.test.ts` now fails on any button or link with a squared `rounded-lg` corner outside the landing pages.
- More pre-redesign outlines removed: Quick search and the sidebar course hover card use the shared popover surface (and the hover card names the course in the display face, not the wordmark's Fraunces); the revision figures between study steps, the scheduled revision windows and the lesson's remove-card confirmation sit in tinted wells; a missing course's message uses the card surface. A design rule keeps Fraunces to the wordmark.
- Input-mode choices now leave text size and other preferences unchanged, so Keyboard/Touch round trips restore the same presentation and Auto retains its existing activity detection.
- Text-size changes reflow immediately without springing Settings selection indicators or scaling the size control; other selection motion and reduced-motion behaviour are retained.
- Keep the redesigned Question editor's Add Concept action disabled for a locked published course, preserving the authoring guard when integrating master.
- Preserve the redesigned timer fields' draft editing while enforcing the existing 60-minute break maximum and 120-minute focus maximum.
- Restored sync from `preview.getlacuna.app` by adding its exact origin to the production relay's CORS configuration and redeploying the existing relay source, preserving the normal app origin and legacy relay alias.
- Progress counts short study sessions: study time was rounded to whole minutes per day before adding up, so days under 30 seconds counted as nothing. Chart axes now step in even quarters (0, 25, 50, 75, 100%) and tooltips read "Reviews: 3" rather than "Reviews : 3".
- Removed superseded plans, audits, the stale roadmap and unused documentation images; retained current question-set contracts in the specification and repaired active references.
- Course analytics: the Questions section sits on the shared card surface, empty or not, like the charts beneath it, instead of an outlined box or a ruled-off line.
- Prevent browser resize errors when question composer fields wrap at a different page width.
- Skip automatic Marks in the question composer Tab sequence, move directly between question rows, and retain keyboard access to marks overrides and row options.
- Redesign question-set attempts around one compact header and a course-style card, with a part stepper, growing answer field, aligned navigation and platform shortcut hints. Short answers fit desktop and phone viewports; marking and reflection share the same surfaces.
- Replace stepped question-set authoring with an autosaving inline composer: growing Markdown fields, weighted mark-scheme lines, parts and subparts, keyboard row actions, inline multiple-choice options, guidance and knowledge links, preview and focused validation. New sets start in Q1; opening or previewing a set no longer focuses the title.
- Unify creation pills and inline name entry, including question-set creation from View mode. Open question sets directly on their contents, with inline title and linkage settings and quiet, accessible autosave feedback.
- Align question composer captions with their fields and shorten the mark scheme caption.
- Redesign question-set overviews with course-style controls, inline questions and attempts, compact recorded results, and a primary Resume action for unfinished attempts.
- Questions: each set now shows when it was last tried, its latest score and, after a few attempts, a small history of scores, with **Attempt** (starting Practice mode) or **Continue** for an unfinished attempt beside it.
- The Questions list no longer goes blank when one saved attempt cannot be read; that set is simply left unscored.
- Use the standard segmented pills for AI connection, audio speed, grading strictness and Question-set response modes, and standard switches for binary authoring and import options. Align the AI settings rows with the other Settings cards while preserving labels, saved values and keyboard controls.
- Keep course tabs clickable with enlarged text by reserving space for the adjacent workspace controls and scrolling the existing tab strip when necessary. (#389)
- Keep the imported Pomodoro and recitation browser regressions compatible with the redesigned course controls and direct recitation entry, preserving their behaviour assertions. (#389)
- Merge the latest master fixes into the redesign branch while preserving its existing layout and regression coverage. (#389)
- Exercise the imported Pomodoro keyboard-focus regression using the redesigned reset control’s existing accessible name. (#389)
- Preserve the minimum touch target for practice editing despite fractional browser geometry, using the existing 48px control height without weakening the 44px regression assertion. (#389)
- Apply the redesign’s existing button-shape rule to the imported recitation marking control. (#389)
- Keep the study test helper compatible with recitation when a lesson opens directly on its first line. (#389)
- Exercise the complete optional Simple Learn workflow independently at desktop and phone widths, preserving its picker, viewport and navigation assertions. (#389)
- Keep optional Simple Learn accessible from Study when the course page already offers the scheduled alternatives. (#389)
- Removed repository agent configurations, the OpenCode comment workflow and its policy tests,
  agent-worktree ignore rules and obsolete workflow references.
- Removed the sharing announcement from Today, including its dismissal state, styles and offline-cache entries. Existing stored dismissal values are safely ignored.
- The course and lesson rename fields are announced as "Course name" and "Lesson name", capitalised like every other label.
- Expanding controls once again grow their surface from the trigger rather than revealing a pre-sized surface: the clip-path reveal showed the full panel behind the expansion and felt slow. Path editors use the same restored surface growth.
- Prevented the prerendered landing page flashing before Today for returning browsers, app hash links and the desktop app, while preserving first-visit landing pages and anchors.
- Align nested settings, note controls, annotations, pairing QR and assessment drawers with the existing motion reference. Retain settings drafts, keep exiting controls inert, measure the assessment editor's height, and preserve the touch sheet's position through drag dismissal. Mobile navigation fades its scrim independently and scales its existing spring with motion speed.
- Bring shortcut help, confirmations, update dialogs, MCP consent and recovery overlays into the shared Direction C dialog system, with viewport bounds, safe-area gutters and motion-speed/reduced-motion support. Align shared-link and update-review states, missing-record recovery, loading placeholders, notifications, desktop controls and archive/card empty states with their current layouts; remove the updater’s small transfer caption.
- Align card and individual-question authoring, batch review, image occlusion, card import and linking controls with the direction C form, surface and motion primitives.
- Use the shared accent-coloured Lacuna mark in the expanded, compact and collapsed sidebar and mobile header. Refresh favicon, PWA, desktop and portable-splash marks to Volt lime, and remove the Download header mark’s separate orange override.
- Align remaining badges, card actions, forecasts, analytics, Settings forms, date/time controls and export tiles with direction C. Unify responsive pill choices, enlarge heatmap day targets and the touch action-sheet handle, and respect motion speed and reduced motion in shared progress and decorative springs.
- Align the Download page, comparison demos and screenshot dialog, public navigation and Method diagrams with the shared palette, pill controls and flat surfaces. Respect motion preferences in disclosures and benchmark changes, remove redundant diagram captions, and wrap long missing-page paths without clipping. Landing hero and lower sections are unchanged.
- Removed Search’s duplicated empty-screen heading and typing instructions, aligned result surfaces with the shared design, named its search field and enlarged filter targets. Clearing filters returns keyboard focus to the input, and reduced motion removes hover and press transforms.
- Import source changes use the shared step animation, retain the header’s position and return focus to the chosen source on Back or empty-form Escape.
- Align Search with Quick search using shared compact result rows, hover selection and active highlights. Move Clear out of the filter row without clearing the query or shifting the chips.
- Share Quick search’s gently staggered spring-and-fade entrance with Search results, scaled by motion speed and disabled for reduced motion.
- Search aligns its heading and reading column with the shared page frame used by Share and Archived.
- Quick-search results and the keyboard-shortcuts overlay become inert and hidden from assistive technology as their exit starts, preventing departing controls from remaining available during the animation.
- Welcome artwork regression checks now recognise stored SVG hashes on Windows checkouts with CRLF line endings.
- Bundled JetBrains Mono with the app and dropped the Google Fonts request on the web build, so school networks and offline reloads no longer depend on a third-party font host; Electron now uses the same bundled fonts instead of injecting 740 KB of base64 font data on every load, and the unused Fraunces face is gone. (#480)
- Sequence and diagram editors now align with the shared course page frame, including their loading states. A single destination-aware Back link replaces duplicated breadcrumbs and meets the 44px target size, while retaining the original lesson or Cards return destination.
- The sequence editor is now a keyboard-first outline: Enter starts the next item, Enter on an empty item starts a new section, Backspace joins, Alt+arrows reorder, and pasting several lines adds one item per line (keeping script speakers). The separate script import dialog is gone; empty items are dropped on save, and Save explains what is missing instead of being disabled.
- Recitation study follows Direction C: borderless card, filled placeholders, number keys mark missed lines, and a typed answer is shown only where it differs from the source.
- Cards lists a sequence's generated cards in item order, each label card after its item.
- Replaced the session modal with a Study-trigger expansion that keeps the course visible and fits phone screens. Session counts, estimates and start behaviour are unchanged. Moved Practise until all correct into Other ways with its whole-course/lesson picker.
- Aligned Study’s expansion with New course: a persistent close control, fixed-size content fading and a surface that contracts back into its trigger.
- Collapsed Settings groups no longer leave a large blank scroll area below Integrations. Positioned content stays inside its panel while forms remain mounted and opening and closing animations are preserved.
- Closing data-settings modals now releases the keyboard trap and hides departing controls immediately while preserving their visual exit. Inline confirmations likewise make outgoing triggers and prompts inert; fast reopening restores the current form or confirmation’s focus.
- Settings: every row label (the Sidebar, Session behaviour, Pomodoro and course-default cards) uses the same semibold label as Appearance and course settings, rather than a small regular one; the Sidebar card's navigation list sits in tinted wells instead of bordered boxes.
- Switches no longer sit a few pixels high in a block container: the shared `Toggle` aligns to the top of its line instead of the text baseline.
- Simplify Settings → Your data: group device-sync actions, keep technical details behind the encryption disclosure and replace the unlocked banner with a compact lock control. Show the three newest restore points with older points under More, using tighter rows and preserving all deletion and restoration confirmations. Restore-point retention is unchanged.
- Share alternatives become inert and hidden from assistive technology as soon as they close or switch, preserving their visual exit and rapid reopening without moving focus from the chosen sharing method.
- Mark archived courses in the Share course picker and selected course label, and prefer active courses when opening Share without a requested course. Archived courses remain available for managing existing share links.
- Share follows the course-page frame and header spacing, with a left-aligned title and content and a right-aligned course picker that wraps on phones. Course switches keep the card surfaces and Other ways heading visible while smoothly adjusting link height and immediately clearing previous outputs and actions; reduced motion remains supported.
- Make departing share-link panels inert and hidden from assistive technology as soon as their state changes, whilst their existing exit animation finishes.
- Fix sharing actions remaining in their loading state after React replays mount effects in development.
- Share: the title no longer sits a few pixels lower than other pages' titles on phones when the course picker is beside it.
- Closing dialogs and inline disclosures immediately remove their controls from keyboard navigation and assistive technology while the visual exit finishes. A departing dialog no longer intercepts Tab, and reopening during exit restores its active controls.
- Today's sharing announcement is one slim line ("One link to share it all.") with Explore sharing and Dismiss, in place of the illustrated two-column banner. It measures its own width, so a narrow column beside the desktop sidebar or a phone drops the second sentence, then the icon, rather than wrapping.
- Animate desktop sidebar collapse and expansion with fixed icon positions, clipped label fades and synchronised content layout. Retain hidden labels and lesson lists with inert accessibility states, honour reduced motion, and suppress hover cards whilst the sidebar moves.
- Animate sidebar course lessons through measured, reversible height springs, staggered lesson rows and a rotating chevron. Courses below and Archived move with the panel, including in the mobile drawer; motion speed and reduced motion are respected.
- Measure the retained sidebar course dropdown from its layout height rather than its transformed bounding box, so the open panel no longer settles a pixel or two short and clips the last lesson.
- Removed the plus button beside the sidebar Courses heading; New course remains on Today.
- Make sidebar course rows a single even line, and fade the course list at a scrolled edge instead of shading it, which glowed in dark mode.
- Sidebar settings keep visibility switches, navigation names and reorder controls within their rows at mobile widths with enlarged text, rather than relying on page overflow checks that miss clipped content.
- Confine the sidebar selection glide to Today/Search content/Progress and Share/Settings/Help separately. Moving between groups or to a course selects directly; course rows retain direct selection and the existing slower glide remains within each navigation group.
- Restored the sidebar Lacuna mark in light mode to a dark accent tile with bright accent strokes, matching its dark-mode contrast and the landing mark, instead of a pale tile with thin dark strokes.
- Run frame-sensitive sidebar motion and original-sized image timing tests serially on an isolated CI runner, retaining four parallel functional shards and all original assertions and budgets.
- Verify sidebar search navigation through the actual destination rather than an href omitted by the app's navigation links.
- Enlarge Sidebar settings reorder controls to 44px targets in a compact horizontal pair, retaining persisted ordering, disabled boundary actions and reset behaviour.
- Slow the sidebar selection glide by 20%, retaining its spring shape, motion-speed scaling and reduced-motion behaviour.
- Return the expanded desktop sidebar's theme toggle to a single bottom footer row beside the collapse chevron. On collapsing, the chevron slides left along that line whilst the theme toggle rises above it, without shifting other content, reversibly, and snapping under reduced motion.
- Simple Learn's header counter now names the current card's place in the session, matching the pip bar and its screen-reader announcement, instead of counting cards cleared.
- Reduced AGENTS.md to universal rules and repository pointers, prohibited harness memory features and MEMORIES.md, and removed MEMORIES.md without adding duplicate repository skills.
- Make New card the one way to add cards, in a lesson and on Cards: its type picker leads with Front / back and Cloze, and More reveals the rarer types, Sequence, Image occlusion and, in a lesson, Link existing cards. Import cards from Cards joins the course's unassigned cards. The separate More ways to add cards menus are gone, Manage only manages, and changing card type slides the new form in from the chosen pill's side.
- Skip the automatic safety snapshot and database replacement for peer sync only when current-format incoming state, import projections and the merge result are provably unchanged. Deletes, migrations and uncertain comparisons retain their safety snapshots; manual backups, pre-migration snapshots, retention and throttling are unchanged.
- The Pomodoro timer no longer jumps when a study step ends: the between-steps screen lays it out exactly where Learn's header has it. Learn's Undo button is now always shown (disabled until there is an answer to undo) on wide screens as on phones, so the timer also stays put when the first answer lands.
- Keep departing step controls out of keyboard navigation and make incoming headings reliably focusable.
- Restyle the "in a row" pop during study: it now sits on the raised surface so its flame stays legible in dark mode, arrives with a calmer spring, and no longer throws confetti.
- Restore compact, content-sized study cards, centred between the header and fixed study controls. Larger cards grow up to the viewport limit while retaining fitted media, registered occlusion masks and internal text scrolling.
- Retain outgoing study cards through their final rendered departure position before removing them, preventing intermittent early disappearance after grading.
- Give study-card exits a deliberate accelerating departure, preserve bounded flick momentum, and let incoming cards settle with a slower spring without bounce.
- Tighten study-card motion to a shorter accelerating exit, cap flick flights at 280ms, and settle incoming cards within 280ms while overlapping the departure.
- Make study cards follow horizontal drags directly and glide away in one continuous motion, carrying flick velocity through grading without waiting for the next card to load. Cancelled drags spring back; vertical scrolling, reduced motion, grading timings and Undo retain their existing behaviour.
- Keep study cards and answer/grade controls within the viewport, scale images and occlusion masks together with compact media padding, and scroll long text inside the card. Position review notifications above the controls so they cannot cover the next card's grade buttons.
- Restored Study’s button-to-card expansion: one opaque surface grows from the trigger while only the button fill fades into the header. The closed primary button remains Volt; contents stay anchored and clipped inside the expansion.
- Study’s trailing arrow now morphs continuously into the close cross using the same two strokes, reversing on dismissal without changing sides.
- Study triggers keep their size on hover.
- Rework study grading with weighted spring departures, overlapping card arrivals, card-local colour and matching button feedback for keyboard grades; carry swipe velocity into the throw and critically damp progress. Preserve immediate reduced-motion grading, repeated cards and Undo, and handle cancelled entrance animation promises.
- Study: the header shares the card's column on every screen of a session (notes, cards and the screen between steps), so Exit lines up with the card's left edge, Undo with its right, and the Pomodoro timer no longer moves when the first card opens.
- The Pomodoro timer is a framed 44 pixel circle like the study header's other controls, and its panel uses the shared menu surface with pill buttons; the trigger reports whether the panel is open, the panel is named, and Reset has its own name.
- Focus mode's exit button is round and reads "Leave focus mode", matching its menu item; the Settings switch reads "Start Learn sessions in focus mode".
- The study sheet counts a wholly new lesson once ("5 new cards", not "5 cards, 5 new").
- Widened study headers across notes, cards and step completion, keeping reading content at its existing measure. Forecast recall now lives in the actions menu so the default header gives the course name and progress more room.
- Show warmed study images immediately in a correctly sized frame, including occlusion diagrams, instead of expanding the card after its image loads. Preserve original media and recover missing display dimensions from background decoding without changing stored data.
- Study: an image on a card is centred beneath the card's centred text, instead of sitting at the left edge.
- Study's notes screen and step-completion screen now give keyboard focus to their primary action, so Enter continues instead of leaving focus on the page body.
- Fix Mermaid dependency loading in the development server so note diagrams render instead of silently falling back to source.
- Give concurrent Mermaid renders distinct IDs so one diagram cannot erase another and leave an empty Diagram source box.
- Start study note disclosures on the mouse press, retain rendered Markdown and diagrams between toggles, and cache disclosure heights without changing the expansion spring or reduced-motion behaviour.
- The lesson notes screen before a study session shares one reading column for its header and notes, with the timer at the column edge and a normal-sized Continue beneath the notes.
- Enlarge the study progress pills by limiting roomier strips to about 17 visible cards, with slightly taller pills and wider gaps. Narrow strips retain their current sizing, and the header height and window glide stay unchanged.
- Keep Simple Learn progress pills readable in large sessions with a width-aware window that glides at roughly 80% progress, handles backwards navigation and snaps with reduced motion. Sessions that fit retain their full-width strip.
- Expand the course Study preview into the full-screen session, retaining a paper cover until content is ready and introducing the header and first blocks in sequence. Motion speed and reduced motion apply throughout. Lesson titles now lead preview rows, with Learn in the secondary line.
- Reduce study startup delays by batching review-history reads and warming study code while the session preview is open. Decode only the next two likely cards' images in the background, without delaying the current card or changing session order.
- On a wide window the study sheet is a centred, rounded panel up to 672 pixels wide, rather than a strip across the full width.
- The study sheet previews today's session before you start: the next step (for example "Learn Cell structure: 9 cards, 5 new, 3 min") and the due reviews offered after it, each with an estimate and a total. One **Start session** button replaces "Continue: …"; due review on its own, assessment revision and Practise until all correct sit under **Other ways**.
- Estimates use the course's mean review time and count a new card as three reviews, since it is introduced and then recalled at least twice.
- Study: keep the Pomodoro timer fixed when continuing from lesson notes into cards and between steps. All three headers share the notes column and place the timer after the available controls, without invisible spacers; the notes layout and Continue button stay unchanged.
- Keep study-transition test act callbacks synchronous so lint does not interpret returned dismissal booleans as unhandled asynchronous work.
- Tag chips and tag suggestions now take a 44px touch target without taller rows: the whole chip removes its tag, and the e2e target probe covers both. (#491)
- Show toast notifications immediately when motion is disabled, keeping actions such as Undo visible.
- Today arrives in order: the exam-day forecast appears whole rather than in pieces, then the course rows fade in from the top. A slow forecast no longer holds the rows for long or pushes them down when it lands.
- Today course titles retain their hover underline and open without the browser URL preview, using a button with Enter and Space support.
- Today: the exam-day forecast now sits above the course list, so the predicted grades come first.
- Today on phones: the card and minute counts share one line with New course, Import moves into the navigation drawer, the exam label centres on its forecast marker, and the top bar's logo no longer sits on a dark tile.
- Today: the sharing announcement now sits below the study queue instead of above it, so the day's courses and their Start buttons are always the first thing on the page.
- Move Today's sync status into the header beside the stats, replacing the full-width banner with a quiet indicator while keeping failed and pending first syncs visibly labelled.
- Wait for the update dialog's initial focus in its unit test, which a loaded runner could check before the focus effect ran.
- Pin Vercel installation and builds to Bun 1.4.3 so preview deployments can run the existing web typechecking command.
- The new Weekly release workflow prepares patch releases on its own: every Thursday, if shipped code on master has changelog entries since the last release, it bumps the version, writes the release notes from those entries and opens an auto-merging release pull request through a release bot GitHub App, after which the existing Release tag workflow publishes it. Weeks with nothing shipped are skipped. Setup is in `docs/maintenance/release.md`.
- Keep workflow-policy checks portable to Windows checkouts by normalising line endings before their existing assertions.

## 0.2.14 beta — question sets, recitation, safer sync and desktop hardening

- Answers given within 10 minutes of an earlier answer to the same card in the same session are now recorded as primed. Until a card clears an unprimed retest, revision readiness makes no short-term recall claim for it instead of trusting an immediate repeat; FSRS scheduling is unchanged (#313)
- Inline confirmations, Pomodoro controls, dialog close buttons, note-row and annotation actions, occlusion and merge-review controls, the course-card study button and accent swatches now meet the 44px minimum target in `docs/spec/accessibility.md`; a source test keeps those files from regressing (#329)
- Moved the React-free cloze helpers from `src/components/markdown/` to `src/utils/cloze.ts`, so the database layer no longer imports the UI folder; a boundary test now rejects any `src/db` import from `components/` or `pages/` (#338)
- `useLearnSession` no longer holds Learn mode's view state (focus mode, full screen, menus, drawer, typed answer), which now lives in `useLearnView`. Its `answer` callback is split into Simple and scheduled paths built from tested grading, persistence, feedback and stopping steps in `answerSteps.ts`, and three unused return fields are gone (#339)
- The sixteen device-local preference modules in `src/state/` are now declarations against one `createLocalSetting` factory, which owns the read, write, change event and cross-tab listener. Storage keys are unchanged, so no preference resets; the key convention (`lacuna.<camelCaseName>`, events `lacuna:<kebab-name>`) is documented in `src/state/localSetting.ts` (#340)
- Added `Field`/`Input`, `SectionCard`, `Skeleton` and `DialogPanel`/`DialogHeader` to `src/components/ui/` and replaced the hand-rolled copies: 22 form inputs, 45 section cards, 115 loading placeholders and 7 modal dialogs. Field errors now set `aria-invalid` and `aria-describedby`, skeletons are hidden from assistive technology, and every converted dialog follows the motion-speed setting (#341)
- The course study flow no longer shows a full-screen hand-off between two ordinary Practice steps when the first cleared its work; it continues straight on. Reaching the daily review goal now marks the summary, so goals, limits, breaks, assessments and lessons still pause (#359)
- The Learn header's completion bar no longer moves backwards when a failed card's retry falls due: a card counts as cleared once it has been answered in the session, whatever the grade, or once it leaves study. The recall figure beside it is labelled as a forecast with its horizon ("at the exam", or "in 7 days" with no exam ahead) (#360)
- The relay mailbox-limit test now injects a no-op persistence instead of a no-op storage, so it no longer serialises the whole session 2,000 times; it runs in under 100ms rather than 10 to 16 seconds and its 15-second timeout override is gone (#387)
- Fix lesson drag reordering immediately after switching into Author mode, without requiring a page reload. (#396)
- Fixed due review leaving an empty card area after the last answer: the study flow planned the next step from the previous course read, and handed it to the finished Learn session instead of starting a new one (#402)
- Every due count now means the same thing and matches the session it opens: introduced cards in reached lessons whose review has passed and which are not yet secure for the exam. The course header previously also counted cards from locked or untaught lessons, so it could disagree with the study sheet and the session. The end-of-course Practice step and Review due cards are now one step under one name, the header's Practice Now button is now Review due cards, and the session report's Cards reviewed counts each card once rather than every retry (#411)
- Cancel delayed card-save navigation when leaving the editor, so opening Share or another route cannot be redirected back to Cards. (#420)
- Replace eyebrow captions with display headings or sentence-case context across the app. (#423)
- Audio cards play again in the web and desktop builds: the Content Security Policy in `index.html`, `vercel.json` and the Electron renderer header now sets `media-src 'self' blob:`, so the blob URLs used for stored audio are no longer refused through the `default-src` fallback; the audio editor also explains how to recover when a clip genuinely cannot play (#459)
- The hosted AI access-code exchange (`/api/ai/session`) now allows 10 attempts a minute and 100 a day from each client address, returning 429 beyond that, so access codes cannot be guessed at speed. It now needs the Upstash quota store, as inference already did.
- Fixed Anki `.apkg` import scheduling review cards from today instead of from the collection's creation day, which pushed imported cards hundreds of days into the future; review due dates now count from the collection's `crt`, falling back to last review plus interval when it is absent
- Reject equations as scalar numeric answers instead of grading their subtraction residual.
- Reject non-finite and non-real numeric mark-scheme arguments before they can create unmarkable criteria.
- Keep media uploaded in the last 24 hours out of orphan collection, so an image or audio clip added to a card that is not yet saved is no longer deleted when an unrelated edit or the daily backup schedules a sweep (#505).
- Automatic CSV and TSV re-import recognises Lacuna's export header before Markdown inside quoted Card content, preserving the complete question and answer.
- Backups and device-sync exports now capture records and referenced media in one database snapshot, preventing concurrent deletion or study writes from producing inconsistent restore data.
- Failed automatic restore-point exports and writes no longer suppress an immediate retry, including overlapping ordinary and forced attempts; a newer successful backup retains its throttle.
- Unit-test backup folder selection, permission refusal and mirror file naming, which had no direct coverage.
- Adding a backup now keeps Question Sets assigned to the retained local final Assessment when the backup uses a different Assessment id, so recovered sets remain usable and restorable.
- Align local development, CI, security audits and release builds on Bun 1.4.2 while preserving the checked-in dependency lockfiles.
- Avoid false duplicate warnings when colons occur at different positions in Card questions and answers.
- Failed Card-row deletions now show an error notification instead of raising an unhandled rejection.
- Changes are now recorded as one fragment file each in `docs/changes/unreleased/` rather
  than as bullets at the top of this file, so parallel pull requests no longer conflict.
  `bun run changelog:release <version> [title]` folds the fragments, and any bullets still
  under "Unreleased", into the release section when a release is prepared;
  `bun run changelog:check` validates them.
- CI now runs when a pull request is retargeted, edited or marked ready for review, so a
  stacked pull request moved onto master gets its required checks. A newer event for the same
  pull request cancels the run it supersedes.
- CLAUDE.md now explicitly allows Claude to merge or close pull requests it judges done, unless told otherwise for a given pull request; crypto changes still need a human read first.
- Honour the configured help shortcut in the shell and Learn mode, refresh shortcut labels when reopening help, and keep consumed closing keys from reopening the overlay.
- Changing a shared course's automatic-update preference concurrently with detaching it no longer restores its shared-copy lock or lineage metadata.
- Unit-test the course-wide daily new-card budget shared by lesson units, which had no direct coverage.
- A study session across several lessons of one course now introduces at most that course's daily new-card limit, rather than the limit once per lesson, matching the Today count
- Stop custom-covered lessons that sit after their assessment, after reordering, from feeding practice and exam-date targeting. Thanks to nc-3388 (#503).
- Keep ranking revision cards when some cards in the pool have no memory-model history, serving those cards in objective order instead of dropping the whole session to ordinary Practice. Thanks to nc-3388 (#503).
- CSV and TSV exports now prefix cells starting with `=`, `+`, `-`, `@`, a tab or a carriage return with an apostrophe, so spreadsheets show them as text instead of running them as formulas. Re-importing a Lacuna export strips the apostrophe again.
- Simple Learn now teaches poetry, speeches and scripts by cumulative recitation: each new line is shown once, then every line of the chunk so far is recited from memory (typed by default, or aloud via a new Study setting) and self-marked, with a recitation from the top after each chunk. Chunks follow stanzas or a per-sequence size (4 lines by default). Each line still gets one review per session, and scheduled reviews recite a due line's chunk down to it
- Make the dashboard loading-placeholder regression deterministic by checking its delay with a controlled clock.
- Keep keyboard focus inside editor dialogs when their shortcut handlers isolate keyboard events; retain field-specific Tab navigation.
- The desktop renderer's Content-Security-Policy now sets `object-src 'none'`, `base-uri 'self'` and `form-action 'self'`, matching the hosted web policy and closing plugin-embed, `<base>` and form-post routes for injected markup.
- A manually dispatched `Electron e2e` workflow runs the Electron AI specs on Windows and macOS and the packaged macOS smoke gate on the branch or tag it is dispatched on, covering branches that CI does not test
- Packaged desktop builds now set Electron fuses: pages loaded from `file://` lose their extra privileges, and `RunAsNode` stays on explicitly because the AI companion depends on it. ASAR integrity, app.asar-only loading and cookie encryption stay at Electron's defaults until verified on packaged builds.
- Fixed first-letter hints moving combining accents from hidden letters onto the visible initial; accents belonging to the initial remain intact.
- Dashboard and navigation forecasts group cards by scheduling source once, avoiding a full card scan for every course while preserving study limits and forecast totals.
- Added a 48px `favicon.ico` and PNG favicons, linked from the landing and comparison pages, so Google Search can show the Lacuna logo instead of a placeholder.
- Preserve the latest 100 built-in AI conversation messages and draft when a long conversation is restored, instead of discarding the entire saved session.
- Reduce main-thread transcript serialisation when oversized built-in AI conversations are trimmed, keeping the largest recent suffix within the existing storage budget.
- Recover the newest built-in AI transcript items and draft from long conversations saved before the item limit was enforced, instead of deleting the stored session on reload.
- Preserve transparency when uploading WebP and GIF images into cards, Question Sets and occlusion diagrams instead of flattening them into JPEG.
- Keep every line of prefixed plain-text answers during card import instead of truncating them after the first line.
- Prevent CSV format detection from crashing on permitted inputs with many short rows and remove redundant column splitting.
- Skip JSON card imports with whitespace-only questions or answers, use populated aliases after blank fields and keep metadata from replacing blank content.
- Retain indented continuation lines and nested answer lists when importing Markdown card pairs.
- Fix blank-line CSV/TSV row separators on Windows and old-Mac text so multiline cards remain separate without rewriting their content.
- Preserve escaped pipes in Markdown table imports and skip aligned delimiter rows rather than creating phantom Cards.
- Preserve every answer line in Markdown list blocks.
- Use quote-aware parsing for single-card and plain-text Anki imports, preserving quoted line breaks and empty question columns.
- Detect single-row CSV and TSV imports without a manual format override.
- Re-import Lacuna full CSV/TSV exports from their question, answer and tag columns, skipping warnings and headers.
- Import the blank-line separated plain-text card blocks described in the import panel, retaining all answer lines.
- Preserve comma-containing answers in prefixed Q/A imports instead of misclassifying the text as CSV.
- Count an unanswered prefixed import question once rather than counting it again in a fallback parser.
- Preserve escaped pipes at the end of Markdown table cells when the row omits its closing separator.
- Recognise and import Markdown table rows with omitted opening pipes instead of dropping their cards.
- The initial JavaScript budget is now 910,000 raw bytes (gzip unchanged at 280,000).
  Question sets add tables, migrations and course cascades to start-up code; their model,
  editor and library still load on demand.
- Consume browser install prompts once, including on dismissal, so repeated clicks cannot reuse an expired prompt.
- Maths in notes and cards renders with its fraction lines and sizing again: Mermaid and the Markdown maths plugin pinned an older KaTeX whose markup the bundled KaTeX 0.19 stylesheet no longer styles, so every consumer now resolves to KaTeX 0.19.0, which also clears a low-severity KaTeX advisory
- A first visit to a link to one of the landing page's sections, such as `#landing-product`, now opens the landing page at that section instead of starting the study app; only `#/` fragments count as app routes
- Lenient answer marking keeps a minus sign before a number, so typing 5 for -5 is no longer shown as correct; a typographic minus matches a hyphen
- Associate the lesson-note title label with its input for accessible naming.
- Importing a published course now keeps its linked bank cards and lesson-card links, and course updates add, change or remove them as the teacher did
- Accepting a course update now moves a note or card to the lesson the teacher moved it to
- Course updates now pass on the teacher's new course name, description and unlock mode, unless the learner has changed that detail themselves
- Importing a published course now keeps the teacher's retention target, daily new-card limit and steady scheduling, as a plain course import already did
- Accepting a course update no longer deletes lessons, notes or cards the learner created in that course; only content the update came with can be removed
- The AI preview of a published course update now shows answer-mode and structured-content changes, and no longer lists sequence or occlusion cards
- Re-importing a published course after detaching it (or importing your own published course) now adds a plain copy instead of failing with a database error
- Two unit tests no longer time out under a parallel full-suite run: the backup rollback test writes a slice of its first batch instead of 2,000 rows (fake-indexeddb rolls each row back with a linear index scan), and the APKG zip-bomb test builds its archive at the fastest compression level with a longer timeout
- Card deletion respects published-course authoring locks across row, bulk and MCP actions. Mixed batches containing a locked Card are rejected atomically, while ordinary, detached and legacy Cards and teacher lineage removals retain their existing behaviour.
- Card imports respect published-course authoring locks: locked courses are excluded from destination choices, and text and Anki imports, including Course-bank and Lesson card-list imports, recheck the lock atomically before adding cards or lessons. Ordinary and detached courses remain editable.
- Locked published Course copies now prevent Card, Sequence, Occlusion and individual Question editor writes, including direct routes, keyboard saves, deletion and Concept creation. Ordinary Study-mode Courses remain editable.
- Preserve literal backslashes before pipes when exporting and re-importing Markdown tables.
- Make Markdown undo capture recent typing and pasted text immediately, and prevent redo from replacing fresh edits.
- Locate Markdown table headers from their delimiter rows and exclude surrounding pipe-containing prose from card imports.
- Reject cross-Course MCP import destinations before any Cards are written, including preview validation.
- Match MCP Card imports within their target Lesson or Course bank, keeping identical questions in different destinations separate.
- On macOS and Linux the desktop app's local MCP socket now lives in its owner-only profile folder instead of the shared temporary folder, so another user on the same machine can no longer occupy the path and stop the companion starting.
- Mermaid diagrams now preload their optional rendering and sanitisation modules to reduce the delay before diagrams replace their source code.
- Keep Mermaid source readable if the SVG sanitiser factory cannot bind to the browser.
- Search and Quick search previews now show multiline cloze answers without exposing cloze markup or hints.
- Fixed working-answer marking so equations beginning with the constants `pi` or `e` cannot earn a value mark merely by copying the expected answer onto the right-hand side.
- The visual design spec now forbids small uppercase eyebrow labels in favour of real headings and sentence-case context
- Strip question and answer labels from numbered Markdown Q/A lists while retaining indented continuation lines.
- Reject numeric answer specifications that cannot evaluate to finite real numbers, preventing Questions with impossible-to-match answers.
- Image-occlusion undo restores the captured canonical review history, clearing later reviews even when the snapshot has no events, so restored scheduling state and analytics agree.
- Patch updates: Zod 4.6.7, Vitest and `@vitest/coverage-v8` 5.0.4, Vite 8.3.4 and Electron 44.7.0. Root, relay and handwriting audits report no high or critical advisories; the remaining moderate root advisory is triaged in the roadmap.
- A course checkpoint now always follows the lesson it was placed after, even when two lessons share a position after a sync merge; the path orders tied lessons the same way assessment coverage does
- Keep Pomodoro focus and break durations accurate when background timer callbacks are delayed, including pause and resume.
- Keep Pomodoro break durations within the timer's supported 60-minute maximum so Settings and the countdown agree.
- Recover from non-finite persisted Pomodoro countdowns and completed-session counts.
- Preserve elapsed Pomodoro time and pending breaks when closing the page, use the latest saved break duration, and display fractional-minute timers as whole seconds.
- Keep keyboard focus inside the expanded Pomodoro timer and return it to the timer button on Escape.
- Keep the active Pomodoro progress ring stable when another tab changes timer durations, including after reopening; apply the new duration to the next phase.
- Keep device-local preferences current when they change between mounting and subscription.
- Fixed lenient typed-answer marking: a word made only of punctuation, such as a lone dash or ampersand, no longer stops an otherwise correct answer from counting as correct.
- Scope the mobile Question editor footer test to its inline confirmation, preserving actionability checks while the outgoing Delete trigger is still mounted.
- Device combination and sync now honour Question Set attempt deletion receipts even when a newer edit keeps the parent Course, preventing deleted attempts and their submitted evidence from returning in later merges.
- Implemented the Paper Question Set authoring interface: real set/draft library, nested
  questions and parts, separate Question/Mark scheme/Links steps, written/calculation/MCQ
  formats, manual concept and related-card linking, lesson/exam selection, described images,
  local autosave and validated Save set. Existing individual Questions remain accessible.
  Author preview shows source context and response layouts without recording learner evidence.
- Added durable personal Question Set attempts in schema v29 and backup/sync v13. Each attempt
  retains its authored questions, diagrams and mark scheme, immutable submitted answers,
  separate corrections and annotations, self-marking decisions and resume position. Practice
  reveals whole-question feedback; Paper waits for submission. Conflicting originals fail
  explicitly during sync. Attempts remain private when sharing Courses and never update Card FSRS.
- Added the Paper learner interface for Question Sets: one answerable part at a time, tall
  written/calculation fields and multiple choice, Practice/Paper submission timing, unanswered
  confirmation, saved resume, and one self-marking criterion beside the original response.
  Added highlights/comments, separate corrections and optional reflection, related-card assistance
  recording, explicit zero/unsure/unmarked decisions, provisional results and attempt history.
  Serial saves retain queued work through failures and drain edits made during slow writes.
- Fixed repeated Question Set attempt merges: combined evidence receives a deterministic bounded
  revision instead of reusing a constituent revision, so subsequent sync with either source does
  not report a false conflict or revert the selected progress. Starting an attempt now reads its
  Course/set and saves its receipt atomically, preventing an orphan attempt if Course deletion
  happens at the same time.
- Replaced the native Question Set image input with a compact chooser, selected-image preview
  and filename. Description and insertion controls appear only after selection; clearing or
  inserting returns focus to the chooser.
- Added related Question Sets to lesson pages, exam details and expanded Cards through existing
  lesson/assessment/Concept links. Practice preserves its entry route; returning to an exam
  reopens its details. These links never alter Card scheduling or create duplicate concepts.
- Added an on-demand Practice evidence panel to Question Set overviews. It separates first
  recorded and repeated attempts, shows self-marked totals and marking dimensions, and keeps
  unresolved marks explicit. Only submitted originals enter denominators; pinned receipts
  preserve historical marks, corrections do not replace evidence, and multi-concept criteria
  are counted once. This is descriptive evidence, not a calibrated exam forecast.
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
- Started the question-set domain foundation: ordered nested content, manual Concept
  links, mark-allocation validation and self-marked totals with explicit unresolved
  states. This is an in-memory foundation, not a new user-facing Questions flow;
  existing storage and schedules are unchanged. See the
  [implementation checklist](https://github.com/TJ7755/Lacuna/blob/5529ceaa43dd976f90a842a2dade788bdfd5b78c/docs/plans/question-sets-implementation.md).
- Release focus from departing route content before hiding it from assistive
  technology. Opening the Question editor no longer retains focus in the hidden
  Questions page; route transition timing is preserved.
- Added durable authored Question Sets to backup v12, peer sync, course-share v4 and `.lacourse`
  course files, including strict parsing, reference validation, deterministic aggregate merges,
  deletion receipts, nested ID remapping and media reachability. The new `lacuna-v12` marker makes
  old readers reject rather than silently discard the added collection; legacy public backups and
  schema v22–v28 pre-migration snapshots remain readable. Backup record validation checks question
  sets with their own strict codec.
- Added device-local Question Set drafts with stale-edit protection, atomic finished saves,
  draft media retention and Course deletion/undo support. Immutable editing helpers retain
  question, part and subpart identities when reordered. Drafts are not backed up, shared or synced.
- Added serial Question Set authoring sessions: edits made during a save are retained,
  stale edits require explicit recovery, and unchanged publication preserves the existing
  content revision. Diagram assets and their draft references are committed together;
  asset cleanup now scans and deletes within one transaction.
- Keep Question practice startup and generated receipts stable across reactive data refreshes, preventing an outstanding presentation from being abandoned before the learner answers it.
- Abandon Question attempts on immediate page unload even when their start has resolved before React effects update the view.
- A Question that was shown but never graded (abandoned, undone or left unanswered) returns in later Question sessions after the unseen ones, instead of never being offered again
- Storage-full errors raised inside a database transaction now show the plain "browser storage is full" message; Dexie re-wraps the quota error there, which the translation previously missed
- Keep another speaker's leading cues with the learner's next script chunk, so crossing a recitation chunk boundary retains the dialogue context.
- Simple Learn recitation is clearer: typed lines are marked automatically (tap a line to overturn its mark, and a fully matching recitation moves straight on), marked lines no longer look like text fields, and the progress bar follows the poem in order, lighting the lines being recited
- Present each new script line with its preceding speaker cues before recall, even when another speaker follows the learner's line.
- Avoid repeated full-sequence scans and growing array copies when ordering large recitation sessions, while retaining the source line order and ordinary card positions.
- The relay no longer reflects any browser `Origin` in its CORS headers. Only the Lacuna web app, the beta deployment, the desktop app and loopback development servers may read its responses; `RELAY_ALLOWED_ORIGINS` adds more. Clients that send no `Origin` are unaffected.
- Keep completed revision days closed when assessment changes replan the remaining schedule, preventing duplicate windows and incorrect next-day suggestions.
- Cancel superseded deferred revision replans when assessment edits are reverted, and describe only the changes still waiting to apply.
- Risk coverage now includes dedicated note-repository and pre-migration snapshot tests, covering note ordering, annotation ranges, error wrapping and the folder-mirror failure handler; both files' floors rise to 100%
- Ignore malformed saved keyboard bindings instead of crashing study shortcuts, while retaining valid custom keys.
- Show readable Markdown link labels in search previews without their destinations or formatting syntax.
- Preserve quoted tag/course names and apostrophes when parsing advanced card search queries.
- Keep unrecognised is: search terms in the text query instead of silently returning a broader set of cards.
- Resolve tied lesson positions consistently when choosing the first semi-linear lesson, keeping lesson access and revision scope aligned with the course path after device merges.
- Sequence undo restores the captured canonical review history, clearing later reviews even when the snapshot has no events, so restored scheduling state and analytics agree.
- Make the `addLessonCard` e2e fixture tolerate the outgoing card editor, whose Front field still holds the new text while it animates out; this removes the strict-mode flake in the share-links spec.
- Override `shell-quote` to 1.12.0 so the root audit passes against GHSA-pqg4-j6r4-53mv; `concurrently` 10.0.5, the latest release, still pins the vulnerable 1.9.0.
- Restore manual marking for typed and aloud poem/script recitation: Check reveals the
  answers without automatic verdicts, punctuation diffs or automatic advancement. Keep
  the recitation card focused on its lines and action, with its title and position available
  to screen readers. Simple Learn now colours each latest manual result immediately and
  preserves its fill under the active outline during cumulative recall.
- Leaving Simple Learn no longer discards your progress: the session resumes where you left it, including the exact line of a poem or script being recited, and the exit dialog says so
- Updated source-map-js to 1.2.2 (GHSA-68fv-2mgg-jv7q) and serialize-javascript to 7.1.2 in the root, relay and handwriting lockfiles
- Prevent browser shortcuts, IME composition and focused select controls from revealing, hiding or grading study cards.
- Keep typed study questions open when Enter confirms an input-method candidate; ordinary Enter still reveals the expected answer.
- Clear the following card's typed answer and hints when Undo restores the previous study question, preventing stale answers and hint penalties from carrying into its retry.
- Fixed lenient typed-answer marking: an answer made only of symbols, such as `%` or `&`, can be marked correct again instead of never matching.
- The concurrent-review sync e2e now expects the fuzzed schedule that merge replay produces since #485, so it no longer fails on every run
- Sync cycles stop admitting delayed data and status updates after their pairing changes, preventing an old success or failure from recreating an unpaired device or overwriting a new pairing.
- A manual reschedule or reset to New now survives sync: both devices' changes are kept and replayed between reviews in time order, instead of being lost when the other device's copy of the card won the merge
- Setting up, joining, unpairing or deleting a sync channel keeps a teacher's share-link write credentials, so published courses can still be republished from this device
- Syncing two devices no longer pulls review due dates forward by a few days: the merge replays reviews with the same interval fuzz the live review used, so an unchanged card keeps its schedule
- Sync settings no longer show a teacher's share-link credentials as a configured sync channel; only a paired channel counts
- Test how an oversized sync snapshot names its largest courses when cards, reviews, sessions and assets reach a course indirectly.
- Compress sync snapshots with gzip before encryption, so libraries well past the relay's 4.4 MB request limit sync again (text-heavy snapshots shrink roughly five- to tenfold; images shrink by about a quarter). Uncompressed snapshots from earlier versions still open, but devices on earlier versions cannot read a compressed snapshot until they update.
- Reject obsolete sync capabilities before transport starts, including cross-tab unpairing and same-channel relay or key replacements; callers with different relay capabilities cannot share an in-flight result.
- Automatic device sync now delays study-end triggers received just after another sync until the minimum interval expires, rather than dropping the final study changes.
- Disposing automatic device-sync triggers now invalidates pending credential restores and module loads, preventing background sync from starting after its installation has closed.
- Keep tag text and existing tags intact when Enter, comma or Backspace is used by an input method during composition.
- Add regression tests for the ten most worrying mutation-testing survivors from the 11 October 2026 test suite audit, covering merge-import review handling, lesson and manual-gate completion, final-assessment validation, session priority, held-out fit acceptance, recall variance and the cram success-grade distribution.
- Keep undo and other notification actions available while keyboard focus remains inside the notification, including after the pointer leaves it.
- Preserve empty leading TSV columns during card import, skipping rows without a question instead of turning answers and tags into a bogus card.
- Preserve quotation marks when exporting Cards as TSV, including simple Anki-compatible exports.
- Keep Windows and old-Mac line endings within Markdown table cells from splitting Card rows.
- Preserve leading decimal points and their minus signs in lenient typed-answer comparison, so `.5`, `-.5` and `5` cannot be marked as the same answer.
- Fix typed-answer feedback rejecting equivalent Unicode accents or accepting a missing accent as punctuation.
- Include padding and borders when resizing virtualised card rows, preventing overlaps.
- Keep large card lists correctly spaced after cards are added or deleted.
- Use JSON default import and explicit TypeScript extensions in Vite config for native loader compatibility.
- Keep OpenCode workflow security-policy tests valid on Windows CRLF checkouts without changing their assertions.
- Keep the Windows installed-upgrade probe on the locally built release now that a newer GitHub release exists, and dismiss the update dialog whenever it appears.

- CI: pull requests that change only documentation (`docs/`, root Markdown, issue and PR
  templates) now skip the heavy jobs. A `changes` job classifies the diff, and the `test`
  and `browser-smoke` gates accept skipped jobs only in that case, so required checks still
  report.

- The relay's anonymous channel and share mint limits (10 per hour per address) now
  live in the blob store, sharing the AI pairing limiter in `relay/src/rateLimit.ts`,
  instead of per-isolate memory keyed on the first `x-forwarded-for` hop. On Vercel the
  address is taken from `x-vercel-forwarded-for`, so a forged `x-forwarded-for` can no
  longer reset the count, and recycling the isolate no longer clears it (#333)

- The AI pairing code is no longer sent in the request path. The MCP client now claims
  with `POST /ai/claim` and an `X-Lacuna-Pairing-Code` header, so the capability stays
  out of platform, CDN and upstream access logs; the code is compared in constant time.
  The relay still accepts `POST /ai/s/:code/claim` for already-installed clients and
  that form should be removed once they have upgraded. The relay needs redeploying
  before clients move to the new route (#332).

- The critical-domain coverage gate (`bun run test:coverage`) now sets a floor per source
  file instead of aggregate thresholds, so a weakly covered file such as `lineageDiff.ts`
  (about 82%) can no longer pass on the others' average. Baselines are in
  `docs/maintenance/coverage.md`. (#330)

- Deleting a Question definition from the Question editor now confirms inline with
  `ConfirmInlineSwap` instead of the blocking browser `window.confirm`, keeping the
  attempt-evidence warning copy (#337).
- The Question editor's save bar now sits above the phone course navigation bar
  below the `sm` breakpoint, so Delete, Save and the inline delete confirmation are no
  longer half-covered or unclickable on phones. The overlap predates #337.

- The Backups settings section now handles a failed backup-folder read: it shows a
  negative notice instead of silently presenting a configured folder as "not
  configured". The persistence check is annotated best-effort, and neither read sets
  state after unmount (#336).

- The titlebar window control IPC (minimise, maximise, close, maximised state) now
  verifies the sender is the main window's main frame, reusing the updater's trust
  check from the new `electron/windowControls.ts`. Untrusted callers are logged and
  ignored; `window:isMaximized` rejects visibly (#334).

- Bulk suspend, resume, tag, bury, reschedule and delete in the card list now catch a
  failed write, leave select mode and the selection intact, and show a negative toast
  naming the operation instead of failing silently as an unhandled rejection. A failed
  Undo of those changes is reported the same way (#325).

- The MCP consent prompt now ignores a course-name lookup that has been superseded by the
  next request and shows the neutral "this course" until the current one resolves, so a slow
  lookup can no longer label a request with the wrong course. A failed lookup is caught and
  leaves the neutral label. (#335)

- Curricular Practice now records its milestone against the same fixed lesson prefix the
  study-flow snapshot checks, while still studying the wider live pool. Previously a
  completed step stored the live-scope fingerprint, never matched, and was offered again.
  Existing milestones are reconciled at read time with no schema change: a completed
  record whose fingerprint equals the node's current live scope still counts as complete,
  any other mismatch leaves the step incomplete (offered once, then rewritten correctly).
  No review history is touched (#358).

- `bun run lint` now covers `api/`, all of `scripts/` (including `.mjs`), `tooling/`,
  `tests/` and the root `*.config.ts` files, and runs with `--max-warnings=0`, so warnings
  fail CI. Command-line scripts and tooling may use `console`. The widened glob found
  three real violations (an expression statement in the performance latency probe and two
  rethrown errors without a `cause`), fixed in place, plus an unused import and a stale
  disable directive (#342).

- Consolidated the ESLint setup into one native flat config per package. The root and
  `tooling/lacuna-ai-mcp` no longer carry a legacy `.eslintrc.cjs` behind a `FlatCompat`
  shim, and `@eslint/compat` and `@eslint/eslintrc` are gone. The rule set is unchanged
  (verified with `--print-config` and identical violation lists). `eslint-plugin-react`'s
  `version: 'detect'` calls `context.getFilename()`, which ESLint 10 removed, so the
  config passes the installed React version explicitly instead of using `fixupConfigRules`.
  The AI MCP package drops its inapplicable React rules (#343).

- A lineage merge that moves a card to another concept now stamps the card's
  `updatedAt`, and the stamp never moves backwards when the card's timestamp is
  ahead of the local clock. Without it the reassignment could lose a last-write-wins
  contest against an older peer row and silently revert on the next merge (#326).

- Pinned `http-cache-semantics` to 4.3.0 through `overrides`. 4.2.0, pulled in by the
  Electron download and packaging tooling, has a high-severity advisory
  (GHSA-ch52-4w7c-c8xp) that failed the root `bun audit` gate.

- The hosted app now sends a `Content-Security-Policy` header with
  `frame-ancestors 'none'`, `base-uri 'self'` and `form-action 'self'`, so the
  app cannot be framed by a third-party page. The header mirrors the
  `index.html` meta policy on `connect-src` origins (#331).

- Associated the new-course name field with its visible label so assistive
  technology announces “Course name” and clicking the label focuses the input (#328).
  Pinned the clock in an existing calendar keyboard test: its first-day fallback
  assertion otherwise fails when the viewed month becomes the current month.

- Backup imports now validate every represented record collection, including nested
  review evidence, Questions, revision plans and distributed-course merge state,
  before preprocessing or database writes. Malformed records report their field path;
  supported older exports retain their existing migration behaviour and additive fields.
  The 200 MB file limit and pre-v22 Deck/Folder refusal remain in place (#327).

### Dependency audit patches

- Updated transitive `brace-expansion` and `undici` entries in the root and relay
  lockfiles to compatible patched versions after new high-severity advisories blocked
  PR validation. Both `bun audit --audit-level=high` checks pass with no findings.

### Markdown diagrams and note links

- Fenced ```mermaid blocks in notes and cards now render as theme-aware diagrams
  (strict security level, bundled locally and loaded lazily on first use, so no CSP
  change and no first-load cost). Failures keep the source code readable, the source
  stays available in a collapsible section, and diagrams re-render when the light/dark
  theme toggles, including when multiple views are open or another view has already
  initialised Mermaid for the new theme. Failed theme renders retain the previous
  diagram and can be retried. Diagram labels use SVG text so sanitisation retains
  their content without allowing embedded HTML.
- Obsidian-style `[[Note name]]` and `[[target|label]]` references render as quiet
  non-navigating pills rather than literal brackets, and are left untouched inside
  code blocks.
- Tables render inside a scrolling card with a semibold header row and row hover,
  so wide revision grids stay legible on narrow screens. The lesson workspace is
  now `max-w-4xl` so diagrams and tables have room to breathe.

**Checks:** red-to-green MarkdownView, wikilink and Mermaid placeholder regressions
(5 failing on the previous master, all passing on branch); web and Electron typecheck;
focused lint; production build including the PWA service worker; release scenario.
Review follow-up: three theme regressions fail on the original PR head and pass
with per-diagram tracking. A Chromium note-authoring regression catches labels
removed during sanitisation and covers rendering, fallback source and theme updates.

## 0.2.13 beta — course overview, website and import fix

- Updated the Windows installed-upgrade gate to use the verified v0.2.12 baseline,
  so the v0.2.13 release is tested against the latest published version.
- Fixed lesson drag targeting when a node ref briefly detaches: the captured
  positions remain usable throughout the gesture. The browser check still
  requires the neighbouring lesson to move on a single pointer update.

- Fixed text imports to a new course failing with “Transaction committed too early”.
  Card validation now runs before the import transaction and is skipped within it,
  so larger plain-text batches commit atomically with their new course and lesson.

- Suppressed the global keyboard-focus indicator on the study card container, which
  is focused programmatically as a return point and had shown an orange frame
  around the whole study column.
- Prerendered the homepage landing content into `dist/index.html` at build time,
  with canonical/social metadata, so crawlers see the hero, product sections and
  links without JavaScript. First-visit browsers hydrate the same landing tree
  and hand over to the study app on in-app navigation; returning browsers, hash
  routes and desktop boot the app directly with no behaviour change.

- Promoted the selected comparison design to `/compare/quizlet/` with build-time
  HTML rendering, canonical/social metadata, sitemap and robots discovery. Added
  a landing-page link and preserved direct sharing/import entry for new visitors.
  The study app retains hash routing and offline support; discarded comparison
  variants remain in the prototype branch.
  Added factual website/application structured data and an explicit comparison
  heading so search engines can identify the site and page purpose without extra copy.

- Expanded comparison A with paired course-structure, memory and import-history
  diagrams. Added a teachers section demonstrating account-free course sharing,
  individual student progress and updates through the same course link.

- Reworked comparison prototype A with an exam-first visual comparison, sticky
  product headings, category filters and expandable evidence. Replaced its imitation
  practice panel with the production flashcard renderer and controls for recall,
  cloze, sequences and typed answers. Demo answers do not alter study records.

- Selected comparison prototype A for further work. Its recall chart now includes
  modelled review history, review-time jumps, a labelled 0–100% scale and a separate
  future projection, replacing the isolated pair of near-flat forecast curves.

- Put exam-day readiness at the start of all three comparison prototypes. Interactive
  SVGs use the existing FSRS forward projections to show how an example card review
  changes predicted recall at different exam horizons and why review gain matters.

- Removed decorative subtitles, section numbering, comparison metadata, screenshot
  captions and redundant feature pills across all three comparison prototypes.

- Replaced all four comparison-prototype screenshots with native 2880 × 1920
  Retina captures and added an image-resolution regression check, keeping text
  sharp in the large product previews and expanded viewer.

- Expanded the three development-only Quizlet comparison prototypes into complete
  pages with real product captures, twelve sourced comparison points, interactive
  practice and import examples, offline/cost guidance, switching advice and FAQs.
  The designs retain theme support and reduced motion. No public page is published;
  the design decision remains pending on `prototype/quizlet-comparison`.

- Added the asynchronous Simple Analytics script on production `getlacuna.app`,
  with the required web CSP permissions and CORS loading for cross-origin isolation.
  Development, preview and desktop sessions do not load it. Do Not Track remains
  respected; no noscript tracker or extra dependency is added.

- Connected `getlacuna.app` to the existing Vercel production project with HTTPS
  and a permanent redirect from `www.getlacuna.app`.
  Kept the previous Vercel address available so existing browser users can export
  their local study data before moving to the new domain.

- Moved the default sync/share/AI relay and AI companion to `relay.getlacuna.app`.
  Desktop share links and hosted AI now use `getlacuna.app`; web share links retain
  their current origin so previews remain usable. The new relay domain aliases the
  existing production project and Blob store, preserving share codes and data.
  Existing saved relay addresses remain valid, including the desktop CSP and CORS
  exception for the legacy relay. Updated web/Electron test fixtures and deployment docs.

- Hid the pre-existing unusable update-review link on archived single-lesson courses;
  restoring the course makes pending updates accessible again.

- Corrected assessment time zones and hid unavailable archived update links in the
  course overview. Narrow-screen selection now moves keyboard focus to its detail
  panel, reduced motion disables Add resizing, lesson labels travel with dragged
  nodes, and practice editing retains a 44px touch target. Browser identity checks
  now assert the chosen Fraunces overview title; visual documentation matches the
  selected design. Author-mode practice stops reserve space for the edit target
  even when names wrap, with connectors spanning the extra space.

- Aligned Study and Practice Now on one row. Cards, Questions, Analytics and course
  Settings now share Path's 1190px frame and responsive gutters, including loading
  states, so switching tabs preserves the content edges.

- Replaced the multi-lesson course overview with the chosen Fieldnotes design:
  a compact winding path, selected lesson companion and actionable assessments.
  Study, practice, lesson creation/import, checkpoint editing, course renaming and
  lesson reordering use their existing persistence and navigation flows. Locked
  lessons, archived inspection, single-lesson courses and shared-course authoring
  restrictions retain their existing rules. Statistics retain the saved visibility
  and order; colours inherit the configured accent and light/dark theme.
  Add expands from its own corner into Lesson, Practice and Checkpoint, with fixed
  text dimensions preventing the previous dismissal enlargement. Motion honours
  reduced motion and the configured speed. Regression coverage includes selection,
  creation, reordering, authoring gates, focus restoration and browser text geometry.

- Renamed user-facing “Curriculum” wording to “Course” across the path, course-card
  progress, Settings and help, retaining saved preference compatibility.
  Removed the comparison routes and switcher after selection. The five prototypes
  and their design notes are archived on `prototype/course-fieldnotes`
  (`236b0b6cf8b438463d246d83f4e6e738e73e3348`); A won for its compact winding
  path and selected lesson companion, with redundant subtitles and the travelling
  selection ring removed during refinement.

## 0.2.12 beta — course links and desktop improvements

- Added the sharing announcement across the app, using the illustrated invitation
  design. It stays visible until dismissed or its Explore sharing link is followed,
  and remembers dismissal per browser/device. The action opens Share with the
  share-link button highlighted after course selection; course selection and publishing
  remain explicit.
  Removed the comparison designs and development-only prototype controls. The
  announcement loads separately to preserve the initial JavaScript budget. Its
  assets are precached for offline starts, load failures leave the app usable,
  dismissal survives shell remounts when storage is blocked, and the layout fits
  the space beside the desktop sidebar.

- Added share links for classroom distribution: the Share page publishes a course
  to the relay and shows one stable link (plus a scannable QR of the link) that
  carries lessons, cards and media. The link itself or its trailing code opens an
  `/#/s/<code>` importer reusing the course-file preview and published-course
  update matching. Pasted links and codes in the import box route there too.
  Republishing updates the same link; student copies poll the lightweight manifest
  on opening the dashboard and merge newer revisions through the existing update
  review, preserving the student's scheduling and edits. Poll merges store
  bundled media with the update, stale polls cannot roll back newer revisions,
  and a link only tracks the course it served. Links are capped at 4 MB
  per payload to stay within free-tier function limits — larger courses keep the
  manual course file. Teachers can stop sharing a link, which deletes the relay
  copy while imported student copies keep working; stopping reports failure
  rather than success when the relay copy cannot be confirmed gone. A course
  whose link was created on another device asks for explicit replacement
  instead of silently forking the link, and the panel shows the uploaded
  revision so a plain publish can never masquerade as an upload. Unpublished
  links expire with the relay's existing inactivity window. The Review updates
  entry now also appears for single-lesson courses, which previously bypassed
  it by rendering the lesson view directly. Unreachable relay hosts report a
  readable connection error instead of a bare fetch failure.

- Forgetting-curve tooltips now show a readable date and predicted recall percentage.
  Review markers no longer disrupt hover selection, keeping the highlighted point
  and tooltip aligned with the hovered day. Exam labels sit above the plot in
  stronger text so the curve cannot cross them.

- Replaced typed-answer reports with inline comparison: muted submitted text above
  the answer, strikethroughs on extra words and soft highlights on missing words.
  Matching answers appear once, without captions or ticks. Word alignment preserves
  strictness, Markdown and cloze context; grading remains manual.
- Kept study cards anchored during reveal and hide by reserving the larger control
  area for both phases. Inactive controls are inert; keyboard focus returns to the
  typing field without scrolling. The shared controls retain the visible answer label
  and the fade-before-lift timing when combined with the desktop interaction changes.

- Replaced the downloaded-update prompt with the selected illustrated dialogue: a
  symmetrical card stack, the version in body text, and expandable release notes.
  GitHub Markdown/HTML notes survive updater progress and the validated preload bridge;
  unsafe markup and remote media are excluded. Missing notes do not block installation.
  Restart remains explicit, Later defers the current version, and the prototypes were removed.

- Improved desktop input and accessibility: Author-mode mouse/pen lesson drags start on
  movement and carry the lesson, with neighbours making room; touch retains its deliberate
  hold and keyboard reordering remains available. Automatic input mode follows the input
  in use, while explicit preferences remain fixed. Input-mode changes wait until a pressed
  control's click has fired, so the first touch on a mouse-operated screen is not lost.
  Card swipes follow held pointers directly.
- Added named card-details controls, labelled search and typed answers, accessible chart
  data tables and stronger secondary-text contrast. Departing course pages are inert;
  step-completion actions are immediately available. Study overlays suppress underlying
  shortcuts, cancel pending grades and recover focus. The deliberate graded-card pause
  and existing flip/departure timing are preserved. See the
  [desktop validation report](https://github.com/TJ7755/Lacuna/blob/30d7e808f9b056afcfd61702c6de7d4ee204e759/docs/performance/2026-09-26/README.md) for evidence and hardware gaps.

- Study controls now fade out before the grading buttons lift in together, on desktop
  and touch layouts. This separates Show answer from Yes instead of overlapping them.
  Motion speed settings scale the transition; reduced motion swaps immediately.
  Implements direction A from the `prototype/card-control-motion` design study.

- Kept the installed Windows upgrade probe clear of the downloaded-update
  dialogue while it records baseline study data, then installed the same verified
  update and checked that the records survived.

- Reorganised the Share page into three steps — course, method, send — from the
  `share-prototype` collapsed-variant study. The five sharing actions no longer
  sit in one row: each method (link, file, code, QR, plain text) shows only its
  own action and output panel, with Change controls to revisit earlier steps.
  Generated outputs are retained while hidden, so switching method and back
  restores them. Reopening course selection keeps those outputs until a different
  course is chosen. Courses with a live link reopen on the link method. The
  throwaway prototype route and its fake data were removed.

- Fixed QR import camera cleanup: stopping or leaving the importer releases the
  camera, including when startup completes after cancellation. Camera permission
  errors remain visible after the scanner closes.

- Added a dedicated Import screen beside New course, with Lacuna course, Anki and
  text/spreadsheet entry points and automatic file routing. Reused the card import
  input and review UI inline, with destination and study-target choices during review.
  Existing lessons and new lessons/courses use the same atomic import writer. Shared
  course files, codes and QR imports reuse the Share workflow and open the imported
  course. New course now handles empty course creation only. Back navigation matches
  the existing editors, with a reserved navigation row keeping headings and content
  stationary across import paths.

## 0.2.11 beta — offline course files, authoring and study improvements

- Fixed packaged release checks timing out when the window already has its route title.
- Explicitly validated inspector callbacks in the installed-upgrade probe before invocation.

- Added offline `.lacuna` course files to Share. Files include referenced images, audio and
  occlusion diagrams once each, without personal study history. File imports preview before
  confirmation and retain published-course update handling. Missing or corrupt media is
  rejected; media and course content import atomically. Text and QR codes remain available.
  Review hardening preserves existing recipient media metadata, keeps Blob reads within the
  export transaction, and prevents slower inspections from replacing a newer preview.

- Replaced inline card import with a fixed-size, two-step dialogue. Paste or upload,
  review real Markdown/cloze previews, and optionally add independent reverse cards.
  Undo returns to the input step with the draft intact; it never deletes study data.
  New courses and lessons can be created with their imported cards, retaining the
  chosen study target. Anki packages preserve scheduling and media, and failed imports
  retain their drafts without leaving partially created destinations. Keyboard focus stays
  within the dialogue when tabbing in either direction. Anki images and audio preview
  directly from the package without saving assets before confirmation. Generated
  reverses retain the original card’s authored answer mode.

- Moved typed answers into authoring: choose a lesson default, override individual cards
  in the editor/creator, or change selected cards together. Study sessions use those choices
  with the existing offline comparison and self-marking. Removed the global typing switch.
  Restoring a draft or leaving Author mode cannot change a hidden answer-mode choice.
- Preserved answer modes through backups, course sharing and author updates; standalone
  card JSON exports include the effective mode so re-import does not depend on a lesson.

- Replaced dashboard course countdown headings with a calendar icon and the exam date.
  Steady retention uses an infinity icon with a hover description and screen-reader label;
  past exams retain their date and subdued warning colour. The calendar is optically
  aligned with the date lettering rather than just its line box. Browser navigation
  checks now locate the dated card using its updated accessible text.

- Separated Practice session completion from predicted recall. The top bar now fills
  as the captured work is cleared and reaches 100% when finished; predicted recall
  or secured proportion stays separately labelled in the header and report.
- Stopped ordinary Practice/FSRS sessions immediately repeating or alternating the
  last cards to chase an exam target. After any rating, a card waits until its saved
  due time before it can return in that session. Undo restores eligibility; due-only
  review, daily limits, new-card caps and planned revision retain their own rules.

- Simplified the session report to a goal heading, reviewed count, accuracy and a thin
  progress bar. Timing, focus, progress change and ratings sit under Session details.
  Removed completion badges, confetti and redundant copy; aligned actions with the
  study-step transition, with Done and Keep studying side by side on mobile. Existing Simple Learn restart and limit overrides are unchanged.

- Added `bun run ai:invites` to generate private batches of beta AI codes and matching
  server credential hashes, with an option to preserve existing users when adding a batch.
- Capped combined AI invitation configuration at 48 KiB to leave room for other
  server settings within Vercel's environment-variable budget.

- Redesigned the study-step transition as a vertical path from the completed topic to
  the next activity, removing the redundant completion and next-step subtitles. The
  topic settles back before the path and destination appear; reduced motion skips the
  sequence. Actions share aligned sizing, and Continue reveals its arrow without
  shifting neighbouring buttons. Paused steps, breaks and revision summaries remain available.
  Browser study and sync checks assert the accessible completion marker instead of the removed subtitle.

- Declared Vercel Blob in the web build's development dependencies because its
  Playwright relay fixture imports the relay store during root typechecking.
  Root-only Vercel installs now resolve the store's types.

- Loaded the desktop updater controller only in Electron, keeping it out of the
  initial browser JavaScript and restoring the existing asset budget.
- Kept committed hosted AI tool receipts and their saved ledger when Stop or disposal
  interrupts an approved local action. Bound each complete hosted request by its
  encoded byte size, retaining complete tool calls and results across continuations.
- Fixed hosted AI provider switches leaving a previous session active, and prevented tabs without
  ownership from overwriting the saved conversation or removing its access code. Older replies
  are trimmed when needed so later turns and the tool ledger remain saved. Rejected exact write
  approvals now tell the model that no change was made.

- Added a Windows CI installed-upgrade probe using the verified v0.2.7 installer and a
  long-running, installed AI companion. It records installer exit codes and process identities
  on failure. The intermittent Codex-hosted shutdown failure remains unexplained.

- Loaded route announcements separately after the initial render, keeping the combined
  maintenance changes within the existing initial JavaScript budget. Precached that deferred
  shell component so cold offline reloads retain it.

- Integrated the maintenance PRs with both Python and packaged macOS required by the test
  gate, pinned actions in the newly added jobs, and focused-test rejection in the new suites.

- Rejected invalid review response times before changing cards, review history or
  calibration, preventing non-finite timing statistics from being saved.
- Blocked startup when a pre-migration snapshot fails and the upgrade path crosses
  destructive schema versions 22, 24 or 26, including the default upgrade to v27.
  Failed snapshots remain retryable; upgrades crossing no destructive version can continue.

- Rejected cross-course card assignments before changing cards, lesson exposures or canonical
  review history. The target lesson must also belong to the selected course.

- Rejected selected backup files over 200 MB before reading or parsing them,
  preventing oversized imports from exhausting the application.
- Restricted comment-triggered OpenCode runs to the repository owner, checked out
  the default branch for both comment events, reduced token permissions, denied
  OpenCode command execution with its API key present, and pinned the action to
  a reviewed commit.

- Allocated lesson and note order indices inside their insert transactions, so concurrent
  creation in the same parent keeps distinct indices and stable listed order.

- Linked Quick search's combobox to its results list only while the list exists,
  keeping its expanded and active option state consistent for assistive technology.
- Made every CI Vitest and Playwright configuration reject focused `.only` tests,
  while keeping local focused runs available for debugging.
- Pinned release, CI and Security workflow actions to reviewed full commit SHAs,
  while keeping version comments and weekly Dependabot updates for maintenance.

- Added CI per-file coverage gates for schema migration snapshots, card and ordering
  repositories, and Learn-session persistence and orchestration. Thresholds use measured
  [baselines](https://github.com/TJ7755/Lacuna/blob/88561dc89556ebeb75de0e68075ad20afb830019/docs/maintenance/coverage.md) so a strong file cannot hide a weak one behind an
  aggregate percentage.

- Counted daily review caps and goals from persisted review events across sessions and repeat
  attempts, with local calendar-day boundaries and the existing Continue anyway override.

- Kept Course Settings section headings below the sticky mobile jumper after
  navigation, matching the existing Settings section offset.
- Ran Electron AI interaction tests against freshly built production renderer assets,
  and checked that Electron loads the hashed entry script from `dist/index.html`.
  The suite still uses its local Electron host and companion transport.

- Added locked Python test jobs for both offline tool workspaces to the required CI test
  gate, and checked the shipped short-term model against shared Python and TypeScript
  prediction cases covering coefficients, count capping and routed handovers.

- Updated Toast countdown bars through transforms instead of React state and
  width changes on every animation frame, preserving their existing timers.
- Added CI typechecking and lint coverage for release-gating Playwright suites and the web
  performance audit, fixing the newly exposed type and lint errors in those paths.

- Checked release tool versions against minimum safe versions and parsed builder
  targets and workflow action identities as YAML. Removed source-text checks already
  exercised by updater tests, Electron tests and release build gates.
- Updated page titles and added a polite route announcement for screen readers across
  shell and full-screen navigation. In-page query changes leave focus and the announcement alone.
- Made shortcut capture a labelled modal with a keyboard-accessible Cancel button.
  Focus stays inside it and returns to the selected shortcut after capture or dismissal.
- Reclaimed abandoned device-sync relay channels during the existing daily maintenance job.
  Each run scans a bounded page and resumes from a stored cursor. Cleanup uses the latest
  metadata or slot upload, waits 24 hours beyond the 90-day channel expiry, and rechecks
  uploads before deleting a group.

- Consolidated decorative modal backdrops into a shared layer hidden from the
  accessibility tree, preserving each overlay's existing click-to-close behaviour.
- Added a required macOS CI smoke for the unsigned packaged Electron app. It checks native
  launch, a course stored across reload, and a seeded study answer in the desktop renderer.

- Added a focused iPhone-sized WebKit browser gate for course navigation, touch study and
  offline navigation. Its single-worker CI job joins the existing required browser check;
  the full Chromium suite remains split across two shards.
- Raised the card editor's touch action bar above the mobile course navigation so its
  Add card action remains tappable.

- Removed repeated lesson headings from the notes-first study screen, leaving the lesson
  name in its header and the notes section heading above the content.
- Moved lesson deletion confirmation below its row so its consequences and action labels
  remain readable at narrow widths, including long unbroken lesson names. Cancelling
  returns focus to the delete button.
- Began the built-in AI Gateway work with a bounded hosted request and streaming-event
  contract, plus a loopback-only AI SDK harness for testing model text and tool calls. Added
  opt-in built-in AI in the existing sidebar for web and Electron, with issued beta access codes,
  server-side free-route selection and atomic limits, streamed answers, local tools and approvals,
  and local transcript recovery. Provider calls remain disabled until the hosted service is
  configured with secrets and a quota store. Kept the server SDKs outside the packaged Electron
  runtime dependency set.
  Replaced the unavailable pinned Gateway model with `poolside/laguna-s-2.1-free` and
  `inclusionai/ling-3.0-flash-fin`, retaining the live zero-price check for each route.
  OpenRouter routes take priority over Gateway when configured and require a live zero-price and
  tool-support check before use. Every Gateway price field must also be zero.
  Prefer pinned OpenRouter Nemotron Ultra and Gemma 4 free models, checking live zero pricing
  and tool support for each, before the variable free router. Log failed provider routes for diagnosis.
  Tell hosted models the exact local tool wrappers and approval behaviour, and try the next
  verified free route when a provider finishes without usable text or a tool call.
  Report a rejected write as a rejection with no mutation, so the model does not describe
  it as an expired or reused approval.
  Verified live preview reads, an approved write, a rejected write and Stop at zero provider
  cost; vague GCSE course requests now ask for a subject rather than inventing a syllabus.
  Made hosted function imports resolvable by Vercel's Node ESM runtime and added a
  compiled-module regression test after the first deployed session request failed at load time.
  Used Lacuna's Electron preload to choose the hosted service URL, so an ordinary browser
  running inside an Electron shell still calls its own preview deployment.

- Corrected Cards virtualisation for lesson lists below the viewport, retaining only
  boundary overscan rows instead of rendering a full viewport in every lesson.
  Study motion and pause timings are unchanged. See the
  [Windows investigation](https://github.com/TJ7755/Lacuna/blob/30d7e808f9b056afcfd61702c6de7d4ee204e759/docs/performance/2026-09-21/optimisation.md).

- Extended the existing performance harness with optional per-operation traces,
  frame/input and transaction diagnostics; ignored stale frame timestamps after a
  diagnostic reset so frame intervals cannot become negative.

- Added optional desktop startup profiling and recorded repeated launches and dashboard
  reloads against the populated Windows profile, separating trace overhead from timings.

- Recorded a managed Windows laptop performance baseline, including installed desktop
  interaction timings, populated-app process samples and the existing heavy-data workload.
  See [measurement methods and limits](https://github.com/TJ7755/Lacuna/blob/30d7e808f9b056afcfd61702c6de7d4ee204e759/docs/performance/2026-09-21/README.md).

- Kept desktop AI connected when navigating between courses, Dashboard and Settings.
  Only navigation that replaces the main document invalidates its AI listener; hash
  routes and subframe loads no longer strand the runtime in its starting state.

- Refined the session report with a clear completion tick, one heading, readable stat labels,
  responsive progress spacing and aligned actions. Progress changes use percentage points,
  and the progress bar announces the study objective.

- Reused date formatters and removed redundant target-time calculations within timezone
  conversion, preserving daylight-saving gap handling and calendar-day grouping.
- Set Vercel's install command to `bun install --frozen-lockfile`, matching CI and
  preventing npm from resolving a different dependency tree and failing on ESLint peers.
- Kept restarted Pomodoro focus sessions counting down while already running.
- Ignored storage quota estimates after their hook is cleaned up, and simplified polling
  ownership so unmounting always stops its interval without retaining a timer ref.

- Kept resized card images and occlusion diagrams at least one pixel wide and tall,
  preventing very thin uploads from failing when their shorter edge rounds to zero.
- Added maintainer commands to wait for exact-commit checks, create a release draft, verify
  downloaded artefacts and updater metadata, and explicitly publish a Windows/Linux beta.
  Publication verifies provenance and checksums afresh and documents the platform scope.
- Reused the existing CI asset budget instead of installing dependencies and rebuilding assets
  in the release verifier. Windows release builds now run the existing packaged interaction
  smoke test before uploading; release configuration tests no longer hard-code the app version.
- Split the full browser CI suite across two shards, preserving the required `browser-smoke`
  aggregate check and uploading each shard's reports for failure diagnosis.

## 0.2.10 beta — on-demand learning and maintenance

- Added optional Simple Learn passes for whole courses or individual lessons inside the Study
  sheet, with a lesson-scoped entry on lesson pages. Study stays available when nothing is due.
  These passes include already introduced and not-yet-due cards, retain FSRS review recording,
  and save progress separately without completing lessons or advancing curricular gates.
  Styled the scope picker's expanded menu in Chromium/Electron, deferred lesson-list queries
  until the options are expanded, and skipped unused curricular queries in optional course passes.
- Updated browser regression setup to choose the scheduled lesson from Study before testing
  grading, motion, keyboard accessibility and sync; retained the existing behavioural assertions.

- Shortened repository memories and the README, split the specification into focused contracts,
  archived older change history, and moved the root glossary, historical QA report and test
  configuration into their owning directories. Removed five obsolete lint suppressions.
- Refreshed release, toolchain and live-user maintenance guidance; added a documentation
  index and repaired historical links without turning archived plans into an active backlog.
- Aligned browser TypeScript library declarations with the ES2022 built-ins already used
  by the application and tests, restoring typechecking after dependency installation.
- Kept virtual-list rendering bounded when the viewport moves below the last row,
  including after a list shrinks, rather than mounting every off-screen row.
- Migrated the application and companion tooling to React 19, TypeScript 7, Vite 8,
  Vitest 5 and ESLint 10, adapting compiler, lint and test configuration to their supported APIs.
  CI uses Node.js 24 and now gates the initial asset budget and the handwriting prototype's
  build and tests as well as its audit.
- Kept charts and Markdown lazy under Vite 8 so the launch bundle and visited-page
  offline cache retain their existing guarantees.
- Aligned the vendored browser optimiser WebAssembly with binding 0.5, preventing
  native tests and browser optimisation from silently using different trainer versions.
- Removed an unused AI mailbox change assignment exposed by the upgraded linter;
  mailbox processing and cancellation behaviour are unchanged.
- Reused completed route prefetches directly so React 19 does not delay the first
  navigation behind a Suspense fallback; cold loads retain their existing loading UI.
- Restricted route prefetch lookups to registered own properties and covered inherited
  property names with regression tests.
- Contained failed downloads of study options and keyboard shortcuts within dismissible
  overlays, preserving the current page and its state.
- Verified the upgraded Zod emitter accepts valid checkpoint assessments in its JSON
  Schema while retaining the existing runtime tool contract and permission scopes.
- Updated Electron to 44.4.1 and Electron Builder to 26.16.1, retaining the release
  configuration checks for vulnerable transitive dependencies.
- Displayed the app version beside the Settings heading on web and desktop.
- Removed duplicated update-version and scheduling-card subtitles.
- Joined the course-path lamp's shade, arm and base into a continuous illustration.
- Fixed recurring and ad-hoc due-review sessions repeating successfully answered cards
  immediately, despite scheduling their next review for tomorrow. These entry points now
  carry the existing due filter into Learn; due sessions recheck each updated due date and
  finish when no scheduled reviews remain due, independently of predicted exam readiness.
- Softened image-occlusion masks with opaque neutral fills, keeping passive masks light
  in both themes, and a distinct accent-coloured
  target with a clearer Fraunces question mark. Revealed labels use a single outline; card and
  diagram sizing, masking rules and scheduling remain unchanged.

## 0.2.9 beta — reliable course reads and study counts

- Aligned the release configuration test with the v0.2.9 package version.
- Fixed course settings section highlighting after asynchronous course loading;
  the desktop rail and mobile jumper now follow scrolling.
- Kept assessment card exclusions within the settings editor when card text is long.
- Centred sidebar hover details on their course row while keeping the popup inside the viewport.
- Enabled internal FSRS interval fuzz for new scheduling configurations by default;
  existing saved preferences are retained.
- Read courses and their final assessments in one database transaction across navigation,
  search, course views and plain queries. Concurrent imports, deletions and replacements
  can no longer mix course and assessment snapshots and trigger a false missing-final error.
- Applied course daily new-card and maximum-review limits to the dashboard forecast.
- Counted only scheduled reviews in “Due” totals and the recurring review step,
  while retaining new cards in “Ready” totals and curricular Practice.
- Removed the redundant reviewed-count and accuracy subtitle between study steps.
- Verified keyboard grading against persisted review history in the browser smoke test,
  replacing its assertion on the removed step subtitle.

## 0.2.8 beta — optional introductions and FSRS learning

- Added a per-course **Learn first** setting, enabled by default. Turning it off lets
  new cards enter spaced repetition without a separate introduction pass, while
  retaining lesson locks and daily new-card pacing. Shared courses retain the preference.
- Simple Learn now records real FSRS reviews using Practice's timing-based grading,
  calibration and hint handling. Its Yes/No queue still repeats missed cards and
  finishes when every card is correct; later Practice uses the resulting memory state.
  Existing introduction records are preserved without inventing historical reviews.

- Windows and Linux packages are published through the native release workflow.
  macOS packages are deferred and will be added separately.
- Removed automatically suspended cards from Simple Learn's queue and progress,
  retaining their recorded review without serving them again or completing the lesson.
- Wait for the lesson's course setting before starting its study session, preventing
  a temporary introduction session when Learn first is disabled.
- Made the review-activity subscription test wait for each observed value rather than
  assuming one event-loop turn completes IndexedDB notifications on every platform.
- Updated packaged-application verification to enter through the current landing action.
- Updated browser analytics and concurrent-review fixtures for graded introductions;
  the sync scenario still requires exactly two distinct, converged review events.
- Gave the large-transaction rollback test a bounded timeout suitable for contended
  runners, retaining its atomicity checks and verifying failure in the second batch.

- Updated the public landing page with a spacious exam-focused hero, twelve flat animated
  illustrations, a centred logo on scroll and a clear closing action. The approved design
  is served directly at `/welcome` and `/landing`, without variant or comparison controls.
  The availability calendar keeps the exam fixed and links selected free slots to an
  illustrative FSRS recall curve with a labelled 80–100% axis. Keyboard access, reduced
  motion and narrow-screen layouts are supported; the superseded hero and chart are removed.
- Updated Download and Method to the same dark visual style. Download presents one
  platform action and compatibility line, with installation guidance on request. Method
  retains its interactive explanations and discloses coefficient details on request.

## Earlier history

See [changes through v0.2.7](https://github.com/TJ7755/Lacuna/blob/b7995873874bbf4d5074430b34481491cc59588c/docs/archive/changes-through-0.2.7.md) for the complete earlier record.
