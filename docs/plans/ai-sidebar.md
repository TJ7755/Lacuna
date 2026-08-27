# AI sidebar — one-week usable prototype

**Status:** in progress — foundation complete; first AI UI checkpoint available

**Written:** 27 August 2026

**Target:** one usable desktop-web prototype within seven calendar days

## Outcome

Lacuna provides an optional **AI** conversation and activity surface in its existing desktop
sidebar. A trusted, deliberately running terminal task attaches to the learner's existing Chromium
tab, repeatedly performs bounded message waits, reads and acts through Lacuna's versioned
domain-tool surface, and writes non-streamed replies back into the sidebar. Lacuna stores no model
credentials and knows nothing about the selected harness or model.

The AI can inspect learning state, create and maintain Lacuna content, and teach using an optional
misconception-first method. Durable learner memories participate in full backup and peer sync.
Conversation transcripts remain local to the browser profile in this prototype.

This is a private tool. The interface says **AI**, not “terminal tutor”, “MCP”, “agent bridge” or a
model name. Those are implementation details.

## What “usable in one week” means

The prototype is accepted only when all six scenarios pass through the real browser and real
repositories:

1. Enable AI, attach a terminal agent to the already-open Lacuna tab, send one message and receive
   one non-streamed response.
2. Reload Lacuna with an unclaimed message pending, reconnect, claim it once and produce one reply.
   A repeated tool-call identifier returns its recorded result. The prototype does not claim
   exactly-once side effects across a crash between a repository commit and receipt persistence.
3. Ask AI to create a course, lessons, cards, Questions and an assessment; approve the global
   course creation and subsequent course-scoped write, then receive structured, selectable receipts
   for records that genuinely exist.
4. Ask a conceptual question with misconception-first enabled; the agent searches relevant
   memories and follows diagnose → conflict → resolve → transfer rather than dumping an answer.
5. Stop while the agent is waiting and between two tool calls; no later call commits, while work
   already completed remains visible and available for Undo where the domain operation supports it.
6. Trigger peer sync by returning focus to Lacuna during a connected conversation. The sync waits
   for an active tool write, preserves the connection and transcript, and exposes merged durable
   memories. A manual full replacement still performs the destructive shutdown and local cleanup.

Agents make this schedule plausible by running independent work in parallel. They do not make
integration, browser behaviour or visual judgement disappear.

## Product decisions

### Surface and naming

- AI is disabled by default. When disabled, no AI control, provider, timer or bridge is mounted.
- AI is desktop-only. Its entry control and full panel appear from 1024 CSS px; it is absent from
  the mobile drawer. If an active desktop session crosses below that threshold through resize or
  zoom, the panel closes but the compact activity/Stop control remains until the run finishes or
  disconnects. A running task must never become uncontrollable because the viewport changed.
- The existing navigation and the AI panel form one compound left workspace:

  ```text
  closed:  [264 px navigation] [page]
  open:    [72 px rail] [400 px AI panel] [page]
  ```

- Opening AI temporarily forces the navigation into its icon rail without overwriting the user's
  saved collapse preference. Closing AI restores the previous visual state.
- The panel is non-modal. The learner may continue using the page while it is open.
- While the panel is closed and work is active, failed or awaiting approval, a compact activity
  capsule appears at the top-right of the application shell. The bottom-right remains owned by
  Lacuna's notification and Undo stack.

### Model and harness independence

- Lacuna exposes a versioned in-page interface. A trusted harness may connect if it can attach to
  the existing Chromium profile, evaluate page JavaScript and sustain a long-running bounded-wait
  loop without deciding the task is finished.
- A browser tool limited to clicks and typing is not supported by this prototype. Recreating 57
  structured domain tools as hidden forms would be an obscenity, not compatibility.
- The reference adapter is
  [Browser Control](https://github.com/anomalyco/browser-control), which drives an attached tab in
  the user's existing Chromium profile through a local relay and extension. The current package
  requires Node.js 22.19 or newer and an unpacked extension; packaging a Lacuna-branded installer is
  deferred.
- Browser Control is a driver, not a wake-up mechanism. A sidebar message cannot start a new model
  turn after the terminal task has ended. The disconnected setup therefore provides one copyable
  bootstrap instruction that starts and maintains the live AI loop.
- OpenCode, Claude Code and Codex are examples, never product concepts. The agent instructions and
  bridge contract must not name one as the preferred runtime.

### Conversation and activity

- One active AI connection and one active conversation are enough for the prototype.
- Replies are complete messages; token streaming is excluded.
- Messages persist through `queued → claimed → completed | stopped`, with an expiring claim lease.
  Every claimed message receives an immutable `runId`.
- While work is active, the UI permits exactly one queued follow-up. Editing replaces that queued
  text. Enter submits; Shift+Enter adds a line. Stop returns the queued follow-up to the composer as
  an unsent draft rather than silently running it.
- Stop is cooperative. It resolves a pending wait and rejects later bridge activity, replies and
  tool calls carrying the stopped `runId`. It cannot terminate arbitrary model inference or revoke
  Browser Control's access to the tab.
- The interface first shows **Stop requested**. It changes to **Stopped** when the terminal loop
  acknowledges the run token. The copy states: **Further AI bridge actions are blocked. Completed
  changes remain.**
- Structured action receipts name the verb, target, result and time and link to created or updated
  Lacuna entities. A generic receipt is acceptable for long-tail tools; the high-value creation and
  update tools receive deliberate formatters.

### Permissions and learning evidence

- Reads retain Lacuna's implicit course-scoped grant behaviour.
- Writes block on the existing session/course-scoped consent model.
- Every destructive AI action uses a one-shot approval bound to connection, run, tool, resolved
  target and validated-input digest. The authorisation is consumed by one exact call and is never
  exposed to the terminal or stored as a session-wide destructive grant.
- The tool surface continues to exclude raw FSRS-state writes, Card review recording and Question
  Attempt recording. The agent may inspect learning evidence; it may not fabricate it.
- Undo payloads remain inside Lacuna. They are never sent to the terminal agent.

### Persistence

- Durable agent memories are included in backup, replace import, recovery merge, encrypted peer
  sync, snapshot equivalence, size attribution and tombstone handling.
- Conversation messages, connection state, activity and grants remain local. Message persistence
  exists to survive reload and reconnect, not to synchronise chat transcripts across devices.
- Connection grants and live activity expire with the AI session.
- Disabling AI during a connection requires **Disable AI and disconnect?** confirmation. Approval
  stops the active run cooperatively, rejects pending approvals and waits, revokes grants, cancels
  queued messages, disconnects the bridge and preserves the local transcript. The UI disables only
  after that shutdown finishes or is explicitly forced with accurate failure copy.
- A manual full replacement or restore first blocks new AI calls and performs the same orderly
  shutdown as disabling: stop the run, reject approvals and waits, revoke grants and disconnect.
  Only then may replacement begin. Success clears local AI conversations, messages, receipts and
  activity because their entity links refer to the replaced database. Imported durable memories
  become authoritative.
- Automatic peer-sync application is not a manual replacement merely because its implementation
  calls `importBackup(..., 'replace')`. It serialises against AI tool writes: wait for the current
  call, block the next, apply the already-merged snapshot atomically, then resume. It preserves the
  connection and all device-local conversation state. Links to remotely deleted entities render as
  **Unavailable**. Startup recovery uses this non-destructive lifecycle; a user-selected recovery
  that discards local state uses the manual replacement lifecycle.

## Architecture

```text
Live terminal task and chosen model
  └── bounded wait → handle run → bounded wait
            ↕ browser tool
Browser Control local relay and extension
            ↕ page JavaScript
window.lacunaAI — versioned in-page interface
            ↕
AI session module
  ├── local conversation queue
  ├── activity, receipts and cooperative stop
  ├── versioned tutoring instructions
  ├── memory search and maintenance
  └── shared tool executor
            ↕
Existing TOOL_REGISTRY and repositories
            ↕
IndexedDB, backup and peer sync
```

### UI seam

React depends on one deep module. Browser automation, IndexedDB and tool execution stay behind its
interface:

```ts
interface AiSession {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AiSessionSnapshot;
  send(content: string): Promise<AiSessionCommandResult<{ messageId: string }>>;
  stop(runId: string): Promise<AiSessionCommandResult>;
  decide(approvalId: string, approved: boolean): Promise<AiSessionCommandResult>;
  resetConnection(): Promise<AiSessionCommandResult>;
}
```

`AiSessionSnapshot` contains connection state, ordered conversation items, current activity and at
most one pending approval. `getSnapshot` remains referentially stable between `subscribe`
notifications so React may consume the same interface through `useSyncExternalStore`; an in-memory
adapter drives every UI state without a live terminal. Stop retains the explicit `runId` because it
acts on one run. Approval identifiers are globally unique and already bound internally to their run,
so `decide` needs only the `approvalId` and human decision.

### Browser seam

The page exposes one versioned interface only while AI is enabled:

```ts
interface LacunaAiBridge {
  readonly protocolVersion: typeof LACUNA_AI_PROTOCOL_VERSION;
  request(request: AiBridgeRequest): Promise<AiBridgeResult>;
}
```

`AiBridgeRequest` is a strict discriminated union containing `connect`, `get_instructions`,
`claim_message`, `list_pending`, `get_run`, `acknowledge_stop`, `set_activity`, `invoke_tool`, `reply`,
`heartbeat` and `disconnect`. The single versioned request seam keeps parsing and expected-error
handling consistent without exposing eleven shallow methods.

`claim_message` waits for at most 20–25 seconds. `list_pending` is the fallback for browser adapters
that cannot safely retain a page promise. A claim persists `conversationId`, `messageId`, `runId`,
lease expiry and state. Every run-scoped mutation verifies the live `runId`; every tool call also
carries a caller-stable `callId`. Repeated calls return a persisted result when one exists. There
remains an unavoidable crash window between a generic repository commit and persistence of its
result ledger, so reconnect instructions require reading the affected Lacuna state before retrying
a call whose outcome is unknown.

The terminal never receives a destructive approval token. The first destructive `invoke_tool`
stores a pending approval bound to the connection, run, call, tool, resolved target and validated-
input digest, then waits for at most 20–25 seconds. `AiSession.decide` resolves that server-held
record. Approval lets the same `callId` resume and consumes the authorisation internally; rejection
returns `forbidden`. Timeout returns `approval_pending`, and repeating the identical `callId`
resumes the same pending record rather than creating another prompt. Stop, disconnect, expiry or
any exact-call mismatch invalidates it.

Every bridge request refreshes connection activity. `set_activity` with `status: 'working'` begins a
generous working lease of at least ten minutes so slow inference is not reported as disconnection.
An expired working lease becomes **Connection quiet**, not **Disconnected**. Explicit disconnect or
repeated failed bounded waits establish disconnection. Adoption of the user tab is exclusive to one
Browser Control session.

### Shared tool execution

Do not copy `handleInvoke` for the web path. Extract its transport-neutral work into one executor:

1. Registry lookup.
2. Input validation.
3. Live scope resolution.
4. Match a grant already issued by the owning adapter.
5. `validateAndRun`.
6. Renderer-side Undo capture.
7. Structured result and activity receipt.

The Electron renderer adapter and AI browser adapter both call this executor. Electron main keeps
its current consent coordinator. `AiToolSession` owns browser-session write consent and one-shot
destructive approvals, then supplies the issued write grant or exact one-shot authorisation to the
executor internally. Moving consent into the shared executor would prompt twice in Electron and turn
a narrow extraction into a rewrite.
Browser protocol errors such as `approval_required`, `approval_pending`, `stopped` and `disconnected`
wrap existing MCP errors rather than leaking into domain-tool definitions.

## Memory

### Record

```ts
type AgentMemoryTag =
  | 'misconception'
  | 'plateau'
  | 'preference'
  | 'session'
  | 'strength'
  | 'context';

interface AgentMemory {
  id: string;
  courseId: string | null;
  tags: AgentMemoryTag[];
  status: 'active' | 'uncertain' | 'resolved';
  content: string;
  references: Array<{
    kind: 'card' | 'concept' | 'lesson' | 'question' | 'course';
    id: string;
    label: string;
  }>;
  basis: 'learner-stated' | 'agent-inferred' | 'observed-performance';
  provenance?: {
    conversationId?: string;
    messageId?: string;
    agentId?: string;
  };
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}
```

Internal IDs are authoritative. Labels are display snapshots only. Course names and card names are
not identities; duplicates and renames exist whether or not pretending otherwise is convenient.

### Invariants

- At least one controlled tag and non-empty, bounded plain text are required.
- `id`, `createdAt` and `courseId` are immutable after creation.
- A scoped memory must name an existing course.
- References must exist and belong to the declared course when the memory is written.
- Global memories carry no entity references in v1. A preference or context that names a Course,
  Lesson, Card, Concept or Question is course-scoped.
- Deleting a referenced Card, Concept, Lesson or Question does not delete the memory. Its stored
  label remains historical and the UI renders the missing target as **Unavailable**. Course deletion
  is different because `courseId` owns the record: it cascades every scoped memory in the same
  transaction, writes their tombstones, includes them in `CourseSnapshot`, and restores them on Undo.
- `session` memories require `expiresAt`. Automatic pruning and consolidation may be deferred, but
  the data must already express disposability. Normal agent search excludes expired memories;
  the inspector may include them explicitly.
- Corrected misconceptions become `resolved`; they are not overwritten or deleted merely to make
  the learner model look tidy.
- Agent inference is labelled as inference. A low FSRS score may trigger diagnosis but is not proof
  of a misconception.
- The AI settings surface includes a compact memory inspector supporting search, correction, status
  change and deletion. Hidden, uncorrectable agent beliefs are rejected.

### Tools

- `lacuna.search_memories` — read, filtered by query, tags and status, with required scope
  `{ kind: 'global' } | { kind: 'course'; courseId: string }`. There is no all-courses search in v1;
  the agent searches global and a relevant Course deliberately.
- `lacuna.create_memory` — write.
- `lacuna.update_memory` — write without scope movement.
- `lacuna.delete_memory` — destructive with Undo.

Search is bounded lexical matching over `content` and reference labels, most recently updated first.
Global searches filter the small collection in memory because IndexedDB does not index `null` keys;
implementations must not attempt `.where('courseId').equals(null)`. Vector search is excluded. The
likely record count does not justify importing a small search-engine theme park.

### Backup and peer-sync semantics

- Add optional `agentMemories?: AgentMemory[]` to `BackupFile`; backups without the collection
  therefore remain valid and full-backup version 11 may stay unchanged. `validateBackup` and
  normalisation structurally validate every memory rather than accepting any array-shaped rubbish;
  replace import also requires each scoped memory's Course to exist in the resulting backup.
- Add schema v25 with `id, courseId, status, updatedAt, *tags` indexes. The migration is additive and
  needs no upgrade body, but pre-migration snapshots must know the table from this version onward.
- Replace import clears and restores memories.
- Recovery merge takes the newer `updatedAt` live record and uses an explicit, tested canonical-JSON
  tie-break at equal time. It carries incoming tombstones but, matching every other recovery-merge
  table, does not apply them as deletions to local live rows.
- Peer merge reuses existing newest-write plus tombstone semantics. A live write newer than a
  deletion deliberately resurrects the memory.
- Undo of memory deletion clears the local tombstone in the same transaction and restores the row
  with an `updatedAt` newer than the deletion, so the next peer merge does not delete it again.
- Global memory bytes are attributed to other local data; course-scoped memory bytes are attributed
  to their course in the sync-size report.

## Misconception-first teaching

The full method is shipped as a versioned instruction bundle returned by the `get_instructions`
request; it is never a pointer to one machine's skill pathname.

AI Settings contains **Use misconception-first teaching when appropriate**. When enabled, the
agent routes requests as follows:

```text
Operational request
→ perform the requested operation directly

Conceptual request without an established misconception
→ diagnose the learner's current model before explaining

Conceptual request with a relevant active or uncertain memory
→ surface the reasonable misconception
→ create cognitive conflict
→ delay the resolution
→ explain the correct model
→ test transfer
→ update the memory only from evidence
```

The method does not apply to procedural work, factual status, completely novel material with no
prior model, or an explicit request for a direct answer. Every instruction bundle also includes:

- relevant-memory search at the start of a teaching exchange;
- source grounding against Lacuna Cards, Questions, Concepts, Lessons and notes;
- conservative memory authorship and learner correction;
- no review/Attempt fabrication or raw FSRS writes;
- activity reporting, approval and cooperative-stop rules.

## UI and interaction specification

### Panel states

- **Disabled:** no runtime or UI outside Settings.
- **Disconnected:** a short setup flow states Node/Chromium prerequisites, provides exact copyable
  Browser Control install and unpacked-extension steps, offers `doctor`/`status` diagnostics, and
  provides one versioned copyable bootstrap instruction. It shows **Waiting for AI**, confirms the
  connected client identity, and gives actionable retry copy rather than “Something went wrong”.
- **Conversation:** transcript, sources, receipts and composer.
- **Working:** conversation remains usable; current activity and Stop appear in the header.
- **Approval:** a structured approval card names the action, scope and consequences.
- **Failed:** persistent error with retry or reconnect.
- **Completed:** receipt remains in history; a minimised capsule shows Done briefly and disappears.

The transcript uses `role="log"` with polite announcement only for newly appended messages. Activity
uses a separate visually hidden polite status. Marking the whole panel live would make assistive
technology reread the conversation whenever the agent changes a verb. The log sets
`aria-relevant="additions text"`; receipt and source links carry meaningful target names.

The panel never traps focus or makes the page inert. Opening focuses the composer in conversation
states and the first meaningful action in disconnected or approval states. Closing restores focus
to the AI trigger.

### Activity capsule

- Make the shell body the positioned containing block and absolutely position the capsule at
  `top-4 right-4`, below the Electron title bar.
- Keep it above ordinary pages and below modal overlays.
- Show status plus **Open** and **Stop**.
- Selecting its body opens a compact popover containing the latest activity, latest reply and one
  queued-follow-up field. **Open conversation** restores the full panel.
- The capsule and open panel are mutually exclusive.
- Escape and outside click close the popover and restore focus to the capsule. Modal overlays render
  above it and suppress capsule interaction while open.

### Visual direction

Follow Lacuna's existing quiet laboratory language:

- Surface, paper, line and one accent colour; no purple chatbot sludge.
- A clean transcript rather than alternating oversized speech bubbles.
- Compact action receipts resembling laboratory records: icon, verb, target, time.
- One significant transition: the navigation contracts while the AI panel unfolds.
- Existing motion-speed and reduced-motion behaviour applies.
- The panel uses `h-full` within the shell body rather than another `h-screen`. Every target is at
  least 44 px and focus is visible.

## Implementation surfaces

### New modules

```text
src/ai/protocol.ts
src/ai/settings.ts
src/ai/instructions.ts
src/ai/bootstrapInstructions.ts
src/ai/browserBridge.ts
src/ai/toolSession.ts
src/ai/repository.ts
src/ai/session/types.ts
src/ai/session/AiSessionContext.tsx
src/ai/session/sessionReducer.ts

src/db/agentMemoryRepository.ts
src/db/replacementLifecycle.ts
src/mcp/tools/memories.ts

src/components/ai/AiPanel.tsx
src/components/ai/AiConversation.tsx
src/components/ai/AiComposer.tsx
src/components/ai/AiActivityReceipt.tsx
src/components/ai/AiApprovalCard.tsx
src/components/ai/AiActivityCapsule.tsx
src/components/ai/AiConnectionState.tsx
src/pages/settings/AiSection.tsx
```

Split rendering concerns before any file approaches 500 lines. `AiPanel.tsx` is composition, not a
new landfill for every state and receipt formatter.

### Existing modules to extend

- `src/components/layout/AppShell.tsx` — compound layout, visibility and capsule placement.
- `src/components/layout/Sidebar.tsx` — optional desktop AI action supplied by `AppShell`; do not add
  AI to default navigation items or the mobile drawer will inherit it.
- `src/pages/Settings.tsx` — AI section and section-rail entry.
- `src/App.tsx` — provider and final bridge wiring.
- `src/components/ui/icons.tsx` — one restrained line icon.
- `src/db/types.ts`, `src/db/schema.ts`, `src/db/mutationStamp.ts` — memory types, schema and
  tombstones.
- `src/db/repository.ts` — Course deletion/Undo snapshots cascade and restore scoped memories.
- `src/db/portability.ts` — distinguish manual replacement from sync/recovery application, await the
  appropriate replacement lifecycle, then perform backup/export/import/recovery merge.
- `src/sync/manualMerge.ts`, `src/sync/cycle.ts` — identify automatic sync application explicitly so
  it cannot inherit manual replacement behaviour by accident.
- `src/sync/mergeSnapshots.ts`, `src/sync/snapshot.ts` — peer convergence and snapshot accounting.
- `src/mcp/registry.ts`, `src/mcp/bridge/scopeResolver.ts` — memory tools and scope resolution.
- `src/mcp/bridge/renderer.ts` — call the extracted shared executor.
- `src/components/mcp/McpBridgeController.tsx` — generic Undo restoration and AI approval reuse.
- `src/vite-env.d.ts` — the deliberately narrow global bridge type.

## One-week execution plan

### Preliminary corrections — two separate commits

The current MCP Undo dispatcher restores Cards, Courses, Lessons and Occlusions explicitly, then
treats every other Undo payload as a Sequence. Existing Concept and Question deletion Undo therefore
calls the wrong restorer. Fix the discriminated dispatch and prove Concept and Question Undo with a
regression test before adding `restoreMemory`. Replace the fallback with an exhaustive dispatch so a
future Undo kind cannot quietly become a Sequence again. This is the first commit.

Also correct the stale current tool-surface version in `docs/SPEC.md`: code exports version 3 while
the specification still says 2. This unrelated documentation correction is the second commit, not a
miscellaneous broom cupboard appended to the bug fix.

### Day 1 — freeze interfaces and red tests

The orchestrator owns a half-day architectural freeze:

1. Record the product decisions and six browser scenarios as typed acceptance fixtures; execution
   belongs to the later UI and browser slices.
2. Define `AiSession`, `LacunaAiBridge`, records, errors, stop semantics and permission flow.
3. Land the protocol/types commit by midday. Every worktree starts from this commit, not stale
   `master`.

Completion criterion: interfaces compile, state/error/identifier invariants are explicit, and no UI
or browser adapter needs a temporary second interface. If this misses midday, cut bespoke long-tail
receipts and inspector embellishment before cutting browser proof, permission safety or memory sync.

### Days 2–3 — four parallel owners

| Owner | Exclusive territory | Completion criterion |
| --- | --- | --- |
| AI UI | `src/components/ai/**`, `AppShell.tsx`, `Sidebar.tsx`, `AiSection.tsx`, AI settings and their tests | Every UI state renders through an in-memory `AiSession`; desktop gating, active-session continuity, focus and capsule mutual exclusion pass |
| Memory persistence/sync | `types.ts`, `schema.ts`, `mutationStamp.ts`, `repository.ts`, memory repository, replacement lifecycle, `portability.ts`, sync application/merge/snapshot modules and focused tests | CRUD/tombstones, Course cascade/Undo, manual replace, non-destructive peer application, recovery merge, peer update/delete/resurrection and snapshot equivalence converge deterministically |
| Browser session | browser bridge, session controller, local conversation repository, shared renderer executor extraction and tests | Live bounded-wait loop, run/call identifiers, claim leases, result ledger, heartbeat states, reload recovery, reply, cooperative stop and disconnect work without UI knowledge or Electron consent changes |
| Tools and pedagogy | memory tools, `registry.ts`, scope resolver, tool session, instruction bundle, bootstrap instruction and tests | Memory permissions and ownership resolve correctly; one-shot destructive approval is consumed; bootstrap starts the live loop; returned bundle contains conditional misconception-first, grounding and safety rules |

Workers share a repository but are not alone in it. Each brief must name exclusive paths, forbid
reverting other work, forbid nested subagents, and require adjustment to the foundation rather than
replacement of it. No two workers edit `AppShell.tsx`, `Sidebar.tsx`, `schema.ts`, `portability.ts`,
`registry.ts` or `App.tsx` concurrently.

### Day 4 — integration and high-value actions

The orchestrator integrates the four branches and owns `App.tsx`; the tools owner remains the sole
owner of `registry.ts`. Add deliberate receipts for:

- create/update Course;
- create/update Lesson;
- create/update Card;
- create/update fixed or generated Question;
- create/update assessment and final exam date.

Long-tail tools use a generic receipt containing tool name, success/failure and returned identifiers.
Run browser scenario 1 on the first integrated build, including installation/setup copy, tab
adoption and at least three empty bounded waits before sending the message. Do not wait for the final
day to discover that the terminal cannot actually stay alive or reach the page.

Completion criterion: one real terminal agent attaches, receives a sidebar message, invokes a read
and an approved write through the existing tool registry, and replies with a rendered receipt.

### Day 5 — trust states

Finish one-shot approval, Undo, stop, reload recovery, connection reset and failure presentation.
Exercise browser scenarios 2, 3 and 5. Verify that:

- stopped runs cannot commit later calls;
- already-committed actions remain accurately reported;
- a rejected or consumed destructive approval cannot be reused;
- reconnect cannot deliver one pending message twice;
- a disconnected agent never leaves the UI claiming it is still working.

### Day 6 — teaching and memory

Exercise scenario 4 against real course content and memories. Check:

- active and uncertain memories are retrieved with intent rather than dumped wholesale;
- misconception-first is used for conceptual change and skipped for operational requests;
- answer delay survives the multi-turn bridge;
- transfer evidence changes a memory deliberately rather than automatically declaring victory;
- the memory inspector can correct, resolve and delete a mistaken agent inference;
- a two-device peer merge preserves the expected memory update/deletion.

### Day 7 — browser quality gate and review

Run the complete automated suite, then browser-driven UI checks at 1024, 1280, 1440 and 1920 px in
light, dark, reduced-motion and 200% zoom conditions. Cover threshold crossing during an active run,
long messages, long code/content wrapping, working, approval, failure and disconnection,
keyboard-only use, Electron title-bar clearance,
command palette, study sheet, toasts and page modals.

Run two final read-only reviews in parallel:

1. **Standards:** repository rules, architecture, performance, accessibility, tests and unrelated
   changes.
2. **Specification:** every product decision, acceptance scenario, permission rule, memory invariant
   and misconception-first branch in this document.

Resolve findings, rerun affected tests and repeat the browser scenario that exercises each fix.
Human visual sign-off remains required; an accessibility tree cannot judge whether the result looks
bolted on.

## Automated proof

Every intentional behaviour change needs a test that fails on the merge base and passes on the
proposed head. At minimum:

- AI setting defaults off and synchronises across tabs.
- AI controls are absent when disabled and from the mobile drawer; an active session retains its
  compact Stop surface when crossing below the full-panel threshold.
- Disabling a connected AI performs the specified shutdown, grant revocation, queue cancellation
  and transcript preservation.
- Manual replacement quiesces an active AI session before writing data; the stale run cannot commit
  after shutdown, and success clears device-local AI state.
- Focus-triggered peer sync waits for any active tool write, applies its merge, preserves the AI
  connection and transcript, and marks links to remotely deleted entities unavailable.
- Session reducer covers connection, queued follow-up, stop, approval, partial completion, retry and
  duplicate suppression.
- Panel tests cover every state, composer/trigger focus, live-region behaviour, receipts and
  approvals through an in-memory adapter.
- Capsule and panel are mutually exclusive.
- Schema v24→v25 preserves existing data and creates the memory store.
- Memory repository covers validation, CRUD, immutable scope, expired-search exclusion, timestamps,
  tombstones and Undo restoration newer than deletion.
- Course deletion cascades scoped memories into its snapshot/tombstones; Undo restores them; later
  entity deletion leaves tolerated historical references.
- Backup validation rejects malformed memories; absent optional collections remain valid; replace
  and recovery merge preserve live memories without applying recovery tombstones as deletions.
- Peer sync is commutative and idempotent for memory create/update/delete/resurrection.
- Schema v25 `readAllDataFromVersion()` retains memories for future pre-migration snapshots.
- Snapshot equivalence and size attribution include absent, global and course-scoped memories;
  `collectLiveKeys` removes superseded memory tombstones.
- Memory tools cover structural validation, explicit global/course search scope, scope resolution by
  `memoryId`, course ownership, write grants and one-shot destructive permission.
- Destructive approval tests cover approve, reject, timeout and same-`callId` resumption, plus stop,
  disconnect, exact-call mismatch and one-shot consumption.
- Shared tool-executor extraction preserves every Electron error and Undo path.
- Browser bridge covers connect, several empty waits, claim leases, `runId` rejection, `callId`
  result replay, heartbeat/quiet states, reload recovery, bounded-wait fallback, cooperative stop and
  deduplicated replies.
- Deterministic Playwright scenarios use a scripted page client for setup, queue, reload,
  permissions, tools, receipts, stop and failure states through the real repositories.
- A recorded instruction-bundle conformance fixture tests misconception-first routing without making
  a probabilistic model response a binary browser regression.
- One manual live Browser Control smoke uses a named harness and model, exercises the six acceptance
  scenarios, records the versions and distinguishes application failures from model behaviour.

Run focused tests during each slice, followed by `bun run lint`, `bun run typecheck`, the full test
suite, the web production build and the browser scenarios. The Electron typecheck and existing MCP
tests remain mandatory even though the new visual surface is web-first.

## Risks and containment

| Risk | Containment |
| --- | --- |
| Browser Control currently needs an unpacked broad-permission extension | Treat it as trusted local development infrastructure; document permissions; defer branded packaging |
| A sidebar message cannot wake an idle terminal | Copyable bootstrap instruction and a live bounded-wait loop; a genuine wake mechanism remains deferred |
| A browser adapter cannot hold the long-poll promise | Bound every wait and provide `list_pending` polling |
| Stop is mistaken for process termination, browser revocation or rollback | Reject later bridge calls by run token, require bridge-only mutation, show Stop requested/acknowledged, accurate copy and existing Undo |
| AppShell transforms or z-indexes pin/cover the capsule | Position inside the shell body; keep AI below modal tiers; browser-check every overlay |
| The agent infers misconceptions from FSRS weakness | Require diagnosis, memory basis and learner-correctable status |
| Memory deletion resurrects after sync | Same-transaction tombstone and existing peer-merge semantics |
| A weaker model ignores teaching or stop instructions | Versioned conformance scenario; do not claim equal capability across models |
| Four workers edit central files concurrently | Exclusive territory and one integration owner |
| UI polish is postponed behind infrastructure | UI adapter starts on day 2; browser acceptance begins on day 4 |

## Deferred beyond the prototype

- Mobile AI.
- Streaming responses.
- Multiple simultaneous agents or conversations.
- Killing arbitrary terminal inference.
- Synchronised conversation transcripts.
- Attachments and binary asset upload.
- Automatic memory consolidation, summarisation and expiry jobs.
- Durable client identity and automatic reconnection across terminal restarts.
- A packaged Lacuna browser extension, installer or generic companion CLI.
- Every long-tail tool receiving a bespoke receipt renderer.
- Cross-browser support beyond the chosen existing-profile Chromium path.
- A market-facing onboarding flow or explanation of terminal harnesses.

## Delivery documentation

After implementation, update `docs/SPEC.md`, `docs/APP-FLOWS.md`, `docs/PERFORMANCE.md`, README setup,
Help, `docs/CHANGES.md` and `MEMORIES.md` only for non-obvious durable facts future agents would get
wrong. Record measured browser evidence and the exact Browser Control version used. Do not present
the prototype as universally harness-agnostic: its required capability is attachment to the existing
Chromium profile plus page-JavaScript evaluation.
