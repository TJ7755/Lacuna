# 15. Settings (`src/pages/Settings.tsx`)

`Settings.tsx` is a thin page composition; the web settings live under
`src/pages/settings/` (with an additional Electron-only MCP surface). The page organises them into
five task groups: **Appearance & access**, **Study behaviour**, **Course defaults**, **Data safety**
and **Integrations**. Existing child section ids remain in the DOM so old deep links continue to
reach the same control. Group ids and ordering remain centralised in the page so the scrollspy and
its navigation cannot drift from the rendered groups.

- **Shared scrollspy rail** (`src/components/ui/SectionRail.tsx`): `useSectionRail`
  (the IntersectionObserver hook), `SectionRail` (the desktop right-hand nav) and
  `SectionRailMobileJumper` (a compact sticky `<select>`-style jumper) were extracted
  from `Settings.tsx` so `CourseSettings` (below) can reuse the same wayfinding over a
  different section list. `useMediaQuery('(min-width: 1280px)')`
  (`src/hooks/useMediaQuery.ts`) is the single breakpoint source both components read,
  so exactly one of the desktop rail or the mobile jumper mounts at a time — never
  both, never neither. Below `xl`, where the rail was previously simply hidden with no
  replacement, the mobile jumper now gives wayfinding to every viewport size.

- **Appearance:** theme toggle (defaults to **dark**); **accent colour** swatches
  (8 choices: Amber plus seven alternatives); **text size** steps that scale all text. All three persist to
  `localStorage` (via `ThemeContext`, `AccentContext`, `FontScaleContext`).
- **Motion:** a **motion-speed** setting with three steps (**Slow**, **Normal** and
  **Fast**) that multiplies animation and transition durations in the app by a single value.
  It is persisted to `localStorage`; the separate `prefers-reduced-motion` preference disables
  motion regardless of this setting. Overlay dialogs (new course, card edit, archive,
  the mobile drawer, the Learn touch sheet) skip enter/exit when the multiplier is 0
  rather than playing a zero-duration keyframe. Expanding panels (share codes, import
  previews, card-list choosers) fade; they do not animate `height` or `margin`.
- **Input mode** (v0.0.2): `auto` (default — `touch` on touch devices,
  `keyboard` otherwise), `touch`, or `keyboard`. The choice drives whether the
  app renders bottom sheets vs. dropdowns, shows or hides swipe hints, and swaps
  hover-only affordances for always-visible ones. Persisted to `localStorage`.
  Switching to touch mode from the default font scale automatically sets the font
  scale to Large (1.15); switching back to keyboard never clobbers an explicit choice.
- **Pomodoro** (v0.0.2): work / short break / long break minutes and
  `autoStartBreaks`. The Pomodoro timer is otherwise fully usable from the Learn
  header.
- **Study behaviour:** **Manual four-point grading** toggle (off by default ->
  silent grader, §10), **Type your answer** toggle (off by default -> flip-to-reveal;
  see "Typing setting" above), audio-answer controls and **Start Learn sessions in Focus Mode**
  (off by default).
- **Course defaults:** automatic Practice placement and the global **Optimise scheduling** default
  (on -> fit FSRS weights to review history, §8.1; gated at `MIN_OPTIMISE_REVIEWS`, overridable per
  course, applied only on confirmation), plus the device-local **After the final exam** policy
  (**Ask me** by default, or **Archive automatically** / **Keep revising**). Practice timing, FSRS retention/interval fields and
  optimisation controls sit behind native **Advanced practice timing** or **Advanced scheduling**
  disclosures. Workload and session-goal fields remain visible.
- **Sidebar:** show due counts (on by default), compact mode (off by default), and per-nav-item visibility toggles for every primary nav
  entry (Dashboard, Review today, Search, Share, Analytics, Settings, Help). **Archived** is fixed
  beneath the **Courses** heading and is not hideable or reorderable; archived courses never appear
  in the ordinary course list. The rendered search
  trigger is **Quick search** when the overlay is available and **Search content** when it must link
  to the full page. Persisted
  to `localStorage` and applied immediately (`src/state/sidebarSettings.ts`). The
  dashboard's own course-ordering control (recent / ready to study / mastery / exam
  date / name / created) is a separate, dashboard-local setting
  (`src/state/dashboardSort.ts`; §4.3), not part of this section.
- **Full backup & recovery:** export the entire local database; **Another device** combines this
  installation with a backup from a second device; **Recover this installation** offers the
  explicit **Add from backup** / **Replace local data** chooser described in §13. Course sharing
  and text/CSV/JSON/APKG card import remain separate flows.
- **Persistent storage:** the app requests `navigator.storage.persist()` on
  first run so the browser does not silently evict IndexedDB data under storage
  pressure. The result (persisted, denied, or unsupported) is surfaced honestly
  in the backup area of Settings, with a clear warning when persistence is
  denied and a pointer to regular exports or folder mirroring as the safeguard.
  The denied warning offers an **Export backup** action to the full-backup anchor. A
  `useStorageQuotaWarning` hook (§16) also surfaces a non-blocking toast when the browser reports
  the database is approaching its quota; that toast is shown once per session and offers
  **Open backups**. If the database cannot open because the quota is full, startup explicitly
  warns users not to clear Lacuna site data, to free browser or operating-system space or leave
  private browsing, and then reload. It does not claim that export is available while the database
  is closed.
- **Automatic backups:** "Back up now"; folder-mirror controls (where
  supported); a list of restore points (timestamp + lesson/card counts) each with
  two-step Delete and Restore confirmation. Deleting removes the IndexedDB restore point from
  Lacuna; an independently mirrored folder file is not removed.
- **Install** (where supported): a panel of platform-specific install
  instructions (PWA, Windows installer, etc.), driven by `useInstallPrompt`.
- **AI** (desktop layouts): a device-local opt-in which is off by default, plus an independent
  stored misconception-first teaching preference. Enabling it adds an **AI** action to the desktop
  navigation at 1024 CSS px and above. Opening the non-modal 400 px panel temporarily contracts the
  existing navigation to its 72 px rail without changing the saved collapse preference; closing
  restores focus to the trigger. Below the breakpoint the inactive surface is absent. Device-local
  AI setting subscribers recheck the stored snapshot when they attach, so an enable or disable
  write between render and subscription is not dropped.

  The production `AiSession` boundary has two transports. The hosted web build creates a ten-minute
  pairing code, persists the local conversation and relay credentials across reload, and polls two
  encrypted directional HTTP mailboxes. Its deliberately running terminal task launches
  `tooling/lacuna-ai-mcp` as a standard stdio MCP server. The packaged Electron build instead runs
  the bundled AI companion entry point through the shipped Electron binary in run-as-Node mode and
  attaches through the authenticated native broker; it does not start a second Chromium browser
  and uses no pairing code, web relay or network listener. Both transports expose exactly
  `lacuna.connect`, `lacuna.wait_for_message`, `lacuna.invoke_tool`,
  `lacuna.reply` and `lacuna.disconnect`, with the enabled renderer retaining session and approval
  authority. On the web transport, browser and terminal use ephemeral P-256 ECDH to derive an AES-256-GCM key;
  the relay receives public pairing metadata, bearer-token hashes and opaque ciphertext only. One
  peer writes each mailbox. `If-Match` accepts either the backing-store ETag or a synthetic
  `"sha256:<lowercase ciphertext digest>"` generation. For a synthetic generation, the relay first
  verifies the current mailbox bytes against the digest and then writes against the current store
  ETag, preserving compare-and-swap rejection of a competing or stale writer. This is outbound
  HTTPS polling, not a browser extension, WebSocket or inbound localhost service.

  A mailbox write whose HTTP acknowledgement is unreadable or returns a server-side `5xx` is not
  retried because the relay may already have committed it. A successful `200` uses the relay's real
  generation from its JSON body or exposed header. Only a damaged acknowledgement falls back to a
  synthetic SHA-256 generation derived from the exact attempted ciphertext. For a
  transport-rejected request, an unusable non-`200` success or a server-side `5xx`, the writer
  performs bounded, authenticated GETs with that digest on its own mailbox. The relay returns a
  receipt only when the current stored ciphertext matches; the writer then derives the same
  synthetic generation without trusting the receipt body or headers.
  Browser recovery uses absolute 0/650/1400 ms offsets, 600 ms per-read aborts and a 2.2-second
  deadline to allow Vercel's cross-origin authorisation preflight to complete. Terminal recovery
  uses 0/250/650 ms offsets, 250 ms per-read aborts and a one-second deadline. A mismatch that
  persists through the receipt window requires reconnection. The recovery path does not trust an
  ordinary platform `ETag`; that header remains legacy `204` compatibility only. If a successful
  backing-store write omits its ETag, the relay re-reads and accepts the generation only when the
  stored ciphertext still matches exactly. A stored mailbox with no ETag fails closed; the relay
  never performs an unconditional repair that could overwrite a concurrent successor.

  A queued message is claimed with an immutable `runId` and a five-minute lease. Lease expiry
  requeues the same stable `messageId`; it never manufactures a duplicate transcript identity. A
  reply authored before the deadline remains valid if the browser's next poll lands after the
  deadline, while a genuinely late reply is ignored. Replies are complete, not streamed. Stop
  changes the browser record to `stop_requested`; the terminal refreshes that record before
  replying, writes `stop_acknowledged`, and refuses a late reply. This is cooperative: it cannot
  terminate inference already running in the model or terminal harness. The terminal task must
  remain alive and repeat bounded waits because Lacuna cannot wake a task which has ended.

  Native AI companion protocol 2 advertises lease renewal during its authenticated handshake. The
  companion renews an active lease once per minute only when that capability was negotiated; a
  current client falls back to the v0.2.3 protocol 1 handshake and does not send an unsupported
  request. Renewal cannot revive an expired or stopped run, and a permanent renewal failure ends the
  active run rather than scheduling an endless retry loop. The renderer remains the clock and
  authority for the new expiry. It also retains a bounded record of completed local replies:
  repeating the same run, message and content is acknowledged without adding a second assistant
  item, while changed content conflicts. This makes an ambiguous reply acknowledgement safely
  retryable without pretending the model itself persists across a terminated client task.

  A bounded wait publishes at most one terminal-mailbox heartbeat per minute. Its relay PUT is
  cancelled at the wait deadline; because the write outcome is then unknown, the companion requires
  reconnection instead of silently continuing or exceeding the advertised bound. The browser treats
  a newer terminal mailbox revision as liveness: an idle connection with no newer revision for 90
  seconds becomes **Connection quiet**, and the next terminal write restores **connected**. An
  active run retains connected status until its claim lease ends, avoiding a false warning while
  the model is legitimately working. Quiet is deliberately not called disconnected because browser
  polling cannot prove that the terminal process has ended. If a claim expires or the terminal
  explicitly disconnects mid-run, Lacuna requeues or recovers the prompt and appends a persistent
  failure record to the local transcript. If the native companion channel disappears before
  claiming a queued prompt, Lacuna stops that transcript item and restores its text as an editable
  draft for explicit resend rather than transferring it automatically to a new owner. Bounded
  failure identifiers include a fingerprint when truncation is required, preserving uniqueness for
  long run and event identifiers.

  Mailbox protocol v3 also carries typed tool calls, browser-owned responses and an immutable
  instruction bundle on every queued message. `buildAiInstructionBundle()` emits `teaching-v1`
  from the live Settings preference. Enabled conceptual requests diagnose the learner's model,
  create a concrete failed prediction, delay resolution, explain the corrected model and test
  transfer; operational work, novel material and explicit direct-answer requests bypass that
  route. Every bundle retains grounding, conservative memory authorship, permission and Stop rules.

  Both session adapters use the shared renderer executor over the existing Electron MCP tool
  registry: registry lookup, validation,
  live scope resolution, repository execution and Undo capture have one implementation. Reads are
  implicit. Course-scoped writes require a connection/course grant; course creation uses a
  one-shot `write_call` approval bound to the exact call and validated-input digest; destructive
  calls use a consumed exact approval. Stable `callId` replay returns the recorded result and
  receipt without repeating the mutation. A resumed approved call ignores an older response for
  that same `callId` until the browser has acknowledged the terminal revision containing the retry.
  Successful Course, Lesson, Card, fixed Question and assessment writes return selectable receipts
  linked to their native surfaces. A receipt whose target was removed by peer sync renders the
  historical label as **Unavailable**; the global pseudo-Course is never linked. Stop and disconnect
  reject later calls and clear grants, approvals and replay state.

  Schema v25 stores bounded `AgentMemory` records with immutable id, creation time and global or
  Course scope; controlled tags; active, uncertain or resolved status; evidence basis; optional
  provenance and expiry; and Course-owned references. Content is limited to 8,000 characters,
  identifiers and provenance ids to 160, reference labels to 500, references to 25, queries to
  1,000 and result limits to 50. `lacuna.search_memories` and `lacuna.create_memory` require an
  explicit global or Course scope; update cannot move scope; delete is destructive with Undo.
  Normal AI search excludes expired session memories. Settings → AI can inspect and search every
  scope, include expired records, correct content and status, or delete a record. Resolved
  misconceptions remain as learner-correctable evidence rather than being silently resurrected.

  Full backup, replacement, recovery merge and encrypted peer sync include memories. Newest-write
  and tombstone rules converge peer update, deletion and deliberate resurrection, while recovery
  and peer merge reject conflicting scope movement. Course deletion cascades scoped memories in the
  same snapshot/Undo boundary. AI writes and data application share `ReplacementLifecycle`:
  peer/recovery application serialises snapshot, merge and import while preserving the session;
  manual replacement synchronously invalidates new AI work, drains admitted writes, attempts relay
  revocation, commits replacement and clears device-local transcript, connection, grants,
  approvals and replay state only after success. The Electron MCP server below is a separate
  local-IPC adapter with its own consent coordinator.

- **MCP server** (Electron only): live stdio-server status, tool-surface version and tool
  count, followed by process-scoped read/write/destructive grants for the whole database
  and each course. Grants can be raised, lowered or revoked and are discarded when Lacuna
  closes.

### Course settings (`src/pages/CourseSettings.tsx`)

The only exam/scheduling settings surface in the app — there is no deck-level settings
page any more. Carries the shared `CourseTabs` (§12) in its header row like the other
three course surfaces, and groups its five headed groups under the same shared `SectionRail`
scrollspy pattern global Settings uses (extracted into `src/components/ui/SectionRail.tsx`
in Arc 10 §10.3, see above), instead of one flat scroll:
**Basics** (rename, exam objective), **Study** (scheduling fields, unlock mode,
auto-practice, optimisation), **Content** (lesson management, practice
nodes), **Assessments** (exam dates), **Danger zone**. Composed from extracted, reusable
section components (originally factored out of the now-deleted deck-settings page so the
same form primitives serve both models while the deck UI still existed; only the
course-facing composition remains). Course name, provenance and the exam-objective toggle live
directly in Basics. `SchedulingFieldsSection` owns new cards per day, target retention with
Relaxed/Balanced/Thorough presets and adaptive guidance copy, maximum reviews and interval,
learning/relearning steps, leech threshold/action, daily review goal and session time limit.
`UnlockModeSection` owns semi-linear versus linear lesson unlocking and its linear cadence fields;
`PracticeSettingsSection` (auto-practice toggle and the four threshold/window/gap fields
feeding `shouldInsertPractice`, §-linked to `src/fsrs/practice.ts`), `ExamDatesSection`
(the final exam/steady-retention target plus dated checkpoints), `LessonManagementSection` (reorder/rename/delete lessons)
and `PracticeNodesSection` (list existing teacher-authored manual practice nodes and link to their
path editor; see §5's Course architecture section), plus the `OptimisationPanel` (§8.1): a
per-course on/off override for scheduling optimisation, a review-count gate, and an
**Optimise now** action that runs in a Web Worker with a progress bar, then shows the
before/after log loss; applying takes a restore-point snapshot first and **Reset to
defaults** is always available.

- **One save model: instant commit everywhere** (Arc 10 §10.3). Every field commits
  through the existing `updateCourse` path as it's edited — there is no staged
  "Save changes" bar and no local draft state to lose. Text and numeric fields (rename,
  course provenance and scheduling numbers) commit **on blur**, with the same
  clamping/validation they always had, so a half-typed value never commits mid-edit;
  toggles, radios and selects (exam objective, unlock mode, auto-practice) commit **on
  change**. The **target-retention slider** is the one exception with its own two-phase
  commit: dragging updates the displayed value locally on every tick but writes to the
  repository only once, on pointer/key release (the discrete preset buttons still commit
  immediately, since they're a single discrete action, not a drag). This replaced an
  earlier split model where ExamDates/LessonManagement/PracticeNodes already committed
  instantly while name/scheduling/unlock/practice/authoring-mode sat behind a sticky save
  button — the ambiguity of not knowing which edits were pending is why the whole page
  now shares one model. **Behaviour change for existing users:** there is no longer a
  way to edit a field and back out without saving — every edit is live immediately.
- **Legacy lesson session filter:** `Lesson.sessionFilter` is retained only so old imports
  remain readable. It has no settings control and does not alter live lesson study, which
  always serves unseen lesson members in Simple mode.
- Once the **final exam date has passed** (§8.2), the configured lifecycle policy asks what to do,
  archives automatically, or keeps the course on its rolling maintenance horizon. Checkpoints do
  not participate. Manual archiving remains available from the dashboard course card.
- **Danger zone:** course deletion uses a confirmation followed by the snapshot + undo-toast
  pattern (`DangerZoneSection`): deleting is performed after the inline confirmation, with an
  "Undo" toast that restores everything from a `CourseSnapshot`
  (`snapshotCourse`/`restoreCourse`, `src/db/repository.ts`): the course, its lessons,
  notes, lesson-card links, practice nodes, assessments, revision plans, cards, their scheduling
  units, and the session history/calibration profiles keyed to the course or those units.
- **Not-found handling:** the course is resolved via a null-sentinel
  `useLiveQuery` (missing row mapped to `null`, matching `CoursePath`) so a
  stale or deleted `courseId` reaches a genuine not-found state instead of
  hanging on the loading skeleton.


[Specification index](../SPEC.md)
