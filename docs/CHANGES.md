# Lacuna — version 0.2.14

## Unreleased

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
  [desktop validation report](performance/2026-09-26/README.md) for evidence and hardware gaps.

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
  [baselines](maintenance/coverage.md) so a strong file cannot hide a weak one behind an
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
  [Windows investigation](performance/2026-09-21/optimisation.md).

- Extended the existing performance harness with optional per-operation traces,
  frame/input and transaction diagnostics; ignored stale frame timestamps after a
  diagnostic reset so frame intervals cannot become negative.

- Added optional desktop startup profiling and recorded repeated launches and dashboard
  reloads against the populated Windows profile, separating trace overhead from timings.

- Recorded a managed Windows laptop performance baseline, including installed desktop
  interaction timings, populated-app process samples and the existing heavy-data workload.
  See [measurement methods and limits](performance/2026-09-21/README.md).

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

See [changes through v0.2.7](archive/changes-through-0.2.7.md) for the complete earlier record.
