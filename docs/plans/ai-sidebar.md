# AI sidebar — one-week usable prototype

**Status:** implementation and streamlined verification complete — normal PR review pending

**Written:** 27 August 2026

**Target:** one usable desktop-web prototype within seven calendar days

## Outcome

Lacuna provides an optional **AI** conversation and activity surface in its existing desktop
sidebar. A trusted, deliberately running terminal task pairs with the web app through a short-lived
code, repeatedly performs bounded message waits through a standard MCP companion, and writes
non-streamed replies back into the sidebar. Lacuna stores no model credentials and knows nothing
about the selected harness or model.

The delivered implementation invokes the existing typed domain tools through one shared executor,
delivers live `teaching-v1` instructions with every claimed message, and maintains bounded,
learner-correctable memories through explicit global or Course scope. It performs reads, requests
scoped or exact write approval, enforces Stop, replays stable calls without duplication, and renders
selectable receipts from real repository results. Conversation transcripts remain local to the
browser profile.

This is a private tool. The interface says **AI**, not “terminal tutor”, “MCP”, “agent bridge” or a
model name. Those are implementation details.

## Current implementation checkpoint

Delivered and source-backed:

- disabled-by-default desktop AI panel and Settings opt-in;
- short-lived one-terminal pairing code;
- standard stdio MCP companion with connect, bounded wait, complete reply and disconnect tools;
- two encrypted directional HTTP mailboxes with one writer each and `ETag` / `If-Match`;
- ephemeral P-256 ECDH and AES-256-GCM envelopes which keep plaintext from the relay;
- local transcript/session reload persistence, queued follow-up handling and cooperative Stop;
- a final Stop refresh before reply, so a terminal cannot knowingly append a late response;
- mailbox protocol v3 tool calls, per-message instruction bundles and browser responses through the
  existing `TOOL_REGISTRY`;
- transport-neutral execution shared by Electron and web AI adapters;
- implicit reads, course-scoped write grants, exact one-shot course creation and destructive
  approvals, stable `callId` replay and real action receipts for authored content;
- schema-v25 learner memories, a Settings inspector and search/create/update/delete tools with
  correction history, Course cascade/Undo, full backup, recovery merge and encrypted peer sync;
- replacement lifecycle fencing which preserves AI for peer/recovery application and revokes and
  clears it only after successful full replacement;
- closed-panel activity capsule with compact follow-up editing, Stop continuity across the desktop
  breakpoint and modal suppression.

## Remaining prototype acceptance target

All six prototype scenarios have passed through the real browser and real repositories:

1. Enable AI, pair a terminal agent with a short-lived code, send one message and receive one
   non-streamed response.
2. Reload Lacuna with an unclaimed message pending, reconnect, claim it once and produce one reply.
3. Ask AI to create a course, lessons, cards, Questions and an assessment; approve exact one-shot
   course creation and the subsequent course-scoped write, then receive structured, selectable
   receipts for records that genuinely exist. This passed in the real browser on 28 August 2026,
   including stable assessment replay and saved-record count verification.
4. Ask a conceptual question with misconception-first enabled; the agent searches relevant
   memories and follows diagnose → conflict → resolve → transfer rather than dumping an answer.
   This passed on 28 August 2026: the run stored an uncertain misconception after approval,
   confronted it with a failed prediction, resolved it from learner evidence and tested transfer.
5. Stop while the agent is waiting and before a reply; the terminal acknowledges the run and a late
   reply is refused. The later domain-action phase must also prove Stop between two tool calls.
6. Trigger peer sync by returning focus to Lacuna during a connected conversation. The sync waits
   for an active tool write, preserves the connection and transcript, and exposes merged durable
   memories. A manual full replacement performs the destructive shutdown and local cleanup. This
   passed on 28 August 2026: peer deletion preserved the terminal and transcript and made the stale
   Course receipt **Unavailable**; full replacement then disconnected and cleared the AI session.

Agents make this schedule plausible by running independent work in parallel. They do not make
integration, browser behaviour or visual judgement disappear.

## Product decisions

### Surface and naming

- AI is disabled by default. When disabled, no AI control, provider, timer or bridge is mounted.
- AI is desktop-only. Its entry control and full panel appear from 1024 CSS px; it is absent from
  the mobile drawer. Crossing below that threshold closes the panel but retains a compact Stop
  control while a run is active or its Stop request is pending.
- The existing navigation and the AI panel form one compound left workspace:

  ```text
  closed:  [264 px navigation] [page]
  open:    [72 px rail] [400 px AI panel] [page]
  ```

- Opening AI temporarily forces the navigation into its icon rail without overwriting the user's
  saved collapse preference. Closing AI restores the previous visual state.
- The panel is non-modal. The learner may continue using the page while it is open.
- A compact top-right activity/Stop capsule appears while the panel is closed. The
  bottom-right remains owned by Lacuna's notification and Undo stack.

### Model and harness independence

- Lacuna exposes a standard MCP companion that any compatible terminal harness can launch over
  stdio. Pairing uses a short-lived code and outbound HTTPS requests from both browser and terminal;
  it does not require an unpacked browser extension, inbound localhost port or model credential in
  the page.
- The relay stores public pairing metadata and opaque encrypted mailbox bodies. Browser and
  terminal derive the mailbox key with ephemeral P-256 ECDH; the relay never receives either
  private key or plaintext conversation content.
- The companion is deliberately a wake-up limitation, not a fake solution to one. A sidebar
  message cannot start a new model turn after the terminal task has ended. The disconnected setup
  therefore provides one copyable instruction that tells the live agent to pair and maintain the
  bounded-wait loop.
- Browser automation remains a harness capability for work on external websites. Lacuna-native
  actions use typed tools through the shared executor.
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
- Stop is cooperative. It rejects later relay replies and domain tool calls carrying the stopped
  `runId`. Stop cannot terminate arbitrary model inference or revoke the terminal harness or
  companion process.
- The interface first shows **Stop requested**. It changes to **Stopped** when the terminal loop
  acknowledges the run token. The copy states: **Further AI bridge actions are blocked. Completed
  changes remain.**
- Successful writes append structured receipts from real repository results. Course, Lesson, Card,
  fixed Question and assessment targets link to their native route; unsupported target kinds remain
  non-interactive rather than inventing a route.

### Permissions and learning evidence

- Reads retain Lacuna's implicit course-scoped grant behaviour.
- Writes block on the existing session/course-scoped consent model.
- Course creation cannot receive a reusable global grant. It uses one-shot `write_call` approval
  bound to connection, run, call, tool, resolved creation target and validated-input digest.
- Every destructive AI action uses a one-shot approval bound to connection, run, tool, resolved
  target and validated-input digest. The authorisation is consumed by one exact call and is never
  exposed to the terminal or stored as a session-wide destructive grant.
- The tool surface continues to exclude raw FSRS-state writes, Card review recording and Question
  Attempt recording. The agent may inspect learning evidence; it may not fabricate it.
- Undo payloads remain inside Lacuna. They are never sent to the terminal agent.

### Persistence

- Conversation messages, pairing credentials and connection state are currently device-local and
  survive ordinary reload. They are not included in peer sync.
- Durable memories participate in full backup, replacement, recovery merge, encrypted peer sync,
  size attribution and tombstone convergence. Course deletion cascades scoped memories and Undo
  restores them.
- Connection/course write grants and exact-call approvals are persisted for reload continuity and
  cleared on Stop-disconnect boundaries; they are never exposed to the terminal.
- Disabling AI unmounts the runtime, stops polling and clears the active local connection.
- Peer and recovery application take the exclusive replacement lifecycle across snapshot, merge and
  import while preserving the session. Manual replacement synchronously rejects new AI writes,
  drains admitted work, attempts remote revocation, replaces the data and clears transcript,
  grants, approvals and replay state only after the commit succeeds.
- Chat transcripts and relay sessions remain device-local and are not part of peer sync.

## Architecture

```text
Live terminal task and chosen model
  └── Lacuna MCP companion over stdio
            ↕ encrypted directional mailboxes
HTTPS relay — pairing metadata and opaque ciphertext only
            ↕ encrypted directional mailboxes
AI session module
  ├── local conversation queue
  ├── encrypted relay adapter and reload persistence
  ├── cooperative Stop
  ├── activity and receipts
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

### Paired relay seam

The UI continues to depend only on `AiSession`. Its production adapter owns pairing, ECDH key
agreement, encrypted mailbox polling, reload persistence and conversion between relay records and
the UI read model. React does not learn relay URLs, generations, tokens or encryption formats.

The terminal companion exposes five MCP tools: connect with a pairing code, wait for a message,
invoke a domain tool, reply and disconnect. Mailbox protocol v3 carries `tool_call` events,
browser-owned `toolResponses`, and a versioned instruction bundle on each queued message; the
encrypted envelope remains independently versioned at v1.

`lacuna.wait_for_message` polls the encrypted browser mailbox for at most 25 seconds. A claim writes
`messageId`, `runId` and a five-minute lease expiry to the terminal mailbox and returns the
browser-owned `conversationId` and content. `lacuna.reply` accepts only that active
`runId`/`messageId` pair and
refreshes the browser mailbox immediately before writing. If it finds `stop_requested`, it writes
`stop_acknowledged`, removes the active run and refuses the late reply. Empty waits are ordinary;
the terminal task must repeat them. The companion serialises its public operations internally so
parallel calls from an MCP host cannot race its single compare-and-swap mailbox writer. Expiry
requeues the same stable `messageId`, and a reply authored within the lease remains valid if the
browser processes it just after the deadline.

The terminal receives display-safe approval errors but never the underlying grant or exact binding.
It retries the same stable `callId` after the browser decision. The browser-owned result ledger
replays an exact match and rejects any attempt to bind that ID to different input.

Claim, reply and disconnect events refresh the current browser session. Explicit terminal
disconnect updates the panel; transient polling failures are retried. Quiet-state lease expiry and
richer failure presentation remain unfinished. One pairing code admits one terminal companion.

### Shared tool execution — delivered

The web path does not copy `handleInvoke`. Its transport-neutral executor owns:

1. Registry lookup.
2. Input validation.
3. Live scope resolution.
4. Match a grant already issued by the owning adapter.
5. `validateAndRun`.
6. Renderer-side Undo capture.
7. Structured result and activity receipt.

The Electron renderer adapter and AI relay adapter both call this executor. Electron main keeps
its current consent coordinator. `AiToolSession` owns browser-session write consent and one-shot
destructive approvals, then supplies the issued write grant or exact one-shot authorisation to the
executor internally. Moving consent into the shared executor would prompt twice in Electron and turn
a narrow extraction into a rewrite.
Browser protocol errors such as `approval_required`, `approval_pending`, `stopped` and `disconnected`
wrap existing MCP errors rather than leaking into domain-tool definitions.

## Memory model — delivered

`AgentMemoryRepository` owns the persistent record boundary. Settings exposes a compact inspector,
and the web companion reaches the same repository through four typed tools.

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

- At least one controlled tag and non-empty, bounded plain text are required. Content is limited to
  8,000 characters; identifiers and provenance ids to 160; reference labels to 500; references to
  25; search queries to 1,000; and result limits to 50.
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
- The AI settings surface includes a compact memory inspector supporting all-scope search,
  correction, status change and deletion, with an explicit option to include expired records.
  Hidden, uncorrectable agent beliefs are rejected.

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

- `BackupFile` accepts optional `agentMemories?: AgentMemory[]`; backups without the collection
  therefore remain valid and full-backup version 11 may stay unchanged. `validateBackup` and
  normalisation structurally validate every memory rather than accepting any array-shaped rubbish;
  replace import also requires each scoped memory's Course to exist in the resulting backup.
- Schema v25 adds `id, courseId, status, updatedAt, *tags` indexes. The migration is additive and
  needs no upgrade body, but pre-migration snapshots must know the table from this version onward.
- Replace import clears and restores memories.
- Recovery merge takes the newer `updatedAt` live record and uses an explicit, tested canonical-JSON
  tie-break at equal time. It carries incoming tombstones but, matching every other recovery-merge
  table, does not apply them as deletions to local live rows.
- Peer merge reuses existing newest-write plus tombstone semantics. A live write newer than a
  deletion deliberately resurrects the memory. Recovery and peer merge reject a conflicting record
  which attempts to move one memory id between global and Course scope.
- Undo of memory deletion clears the local tombstone in the same transaction and restores the row
  with an `updatedAt` newer than the deletion, so the next peer merge does not delete it again.
- Global memory bytes are attributed to other local data; course-scoped memory bytes are attributed
  to their course in the sync-size report.

## Misconception-first teaching — delivered

`buildAiInstructionBundle()` produces the versioned `teaching-v1` contract rather than pointing to
one machine's skill pathname. Each queued message captures the live **Use misconception-first
teaching** setting, and `lacuna.wait_for_message` returns that bundle with the claim. The agent
routes requests as follows:

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

The method does not apply to procedural work, factual status, completely novel material
with no prior model, or an explicit request for a direct answer. Its instruction bundle also
includes:

- relevant-memory search at the start of a teaching exchange;
- source grounding against Lacuna Cards, Questions, Concepts, Lessons and notes;
- conservative memory authorship and learner correction;
- no review/Attempt fabrication or raw FSRS writes;
- activity reporting, approval and cooperative-stop rules.

## UI and interaction specification

### Panel states

- **Disabled:** no runtime or UI outside Settings.
- **Disconnected/pairing:** the delivered setup starts pairing, shows the short-lived code and
  provides one copyable terminal instruction. It confirms the connected client identity and gives
  actionable retry copy.
- **Conversation:** the delivered transcript and composer carry user and assistant text.
- **Working:** conversation remains usable; current activity and Stop appear in the header.
- **Approval:** the browser renders the exact pending action and safe-first decision controls; the
  terminal sees only display-safe pending/rejected results.
- **Failed:** persistent error with retry or reconnect.
- **Receipts:** successful writes append a structured receipt built from the repository result.
- **Completed capsule:** closing the full panel retains compact status and follow-up controls. The
  compact Stop control is shown only for an active or Stop-requested run.

The transcript uses `role="log"` with polite announcement only for newly appended messages. Activity
uses a separate visually hidden polite status. Marking the whole panel live would make assistive
technology reread the conversation whenever the agent changes a verb. The log sets
`aria-relevant="additions text"`; receipt and source links carry meaningful target names.

The panel never traps focus or makes the page inert. Opening focuses the composer in conversation
states and the first meaningful action in disconnected or approval states. Closing restores focus
to the AI trigger.

### Activity capsule

This is delivered through the existing `AiSession` read and command seam.

- Make the shell body the positioned containing block and absolutely position the capsule at
  `top-4 right-4`, below the Electron title bar.
- Keep it above ordinary pages and below modal overlays.
- Show status plus **Open** and **Stop**.
- Selecting its body opens a compact popover containing the latest activity, latest reply and one
  queued-follow-up field. **Open conversation** restores the full panel.
- The capsule and open panel are mutually exclusive.
- Escape and outside click close the popover and restore focus to the capsule. Modal overlays render
  above it and suppress capsule interaction while open.
- Below the full-panel breakpoint, only an active or Stop-requested run retains the compact safety
  surface; completed activity does not become a mobile AI entry point.

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

### Delivered modules

```text
src/ai/protocol.ts
src/ai/settings.ts
src/ai/relayProtocol.ts
src/ai/relayCrypto.ts
src/ai/relayClient.ts
src/ai/toolSession.ts
src/ai/session/types.ts
src/ai/session/AiSessionContext.tsx
src/ai/session/relay.ts

src/components/ai/AiPanel.tsx
src/components/ai/AiConversation.tsx
src/components/ai/AiComposer.tsx
src/components/ai/AiApprovalCard.tsx
src/components/ai/AiConnectionState.tsx
src/components/ai/AiActivityReceipt.tsx
src/components/ai/AiActivityCapsule.tsx
src/pages/settings/AiSection.tsx

src/mcp/executor.ts

relay/src/aiRelay.ts
tooling/lacuna-ai-mcp/**
```

### Delivered teaching, memory and lifecycle modules

```text
src/ai/instructions.ts
src/ai/entityAvailability.ts
src/db/agentMemoryRecord.ts
src/db/agentMemoryRepository.ts
src/db/replacementLifecycle.ts
src/mcp/tools/memories.ts
src/pages/settings/AiMemoryInspector.tsx
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
- `relay/src/aiRelay.ts`, `relay/vercel.json` — short-lived pairing and two opaque directional
  mailboxes.
- `tooling/lacuna-ai-mcp/**` — the model-agnostic stdio companion.

## One-week execution plan

### Preliminary corrections — delivered

The former MCP Undo dispatcher restored Cards, Courses, Lessons and Occlusions explicitly, then
treated every other Undo payload as a Sequence. Concept and Question deletion now use their proper
restorers, with exhaustive dispatch preventing a future Undo kind from silently becoming a
Sequence.

The stale tool-surface version in `docs/SPEC.md` was also corrected to version 3 in a separate
documentation change.

### Day 1 — freeze interfaces and red tests

**Status: delivered.** The typed session seam, strict bridge protocol and six browser scenarios are
in source. Mailbox protocol v3 was added for domain actions and per-message instructions without
changing the encrypted
envelope version.

The orchestrator owns a half-day architectural freeze:

1. Record the product decisions and six browser scenarios as typed acceptance fixtures; execution
   belongs to the later UI and browser slices.
2. Define `AiSession`, relay mailbox records, errors, stop semantics and permission flow.
3. Land the protocol/types commit by midday. Every worktree starts from this commit, not stale
   `master`.

Completion criterion: interfaces compile, state/error/identifier invariants are explicit, and no UI
or relay adapter needs a temporary second interface. If this misses midday, cut bespoke long-tail
receipts and inspector embellishment before cutting browser proof, permission safety or memory sync.

### Days 2–3 — four parallel owners

**Status: delivered.** AI UI, relay session, shared execution, memory persistence/sync and pedagogy
all meet their completion criteria.

| Owner                   | Exclusive territory                                                                                                                                                                 | Completion criterion                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI UI                   | `src/components/ai/**`, `AppShell.tsx`, `Sidebar.tsx`, `AiSection.tsx`, AI settings and their tests                                                                                 | Every UI state renders through an in-memory `AiSession`; desktop gating, active-session continuity, focus and capsule mutual exclusion pass                                                                         |
| Memory persistence/sync | `types.ts`, `schema.ts`, `mutationStamp.ts`, `repository.ts`, memory repository, replacement lifecycle, `portability.ts`, sync application/merge/snapshot modules and focused tests | CRUD/tombstones, Course cascade/Undo, manual replace, non-destructive peer application, recovery merge, peer update/delete/resurrection and snapshot equivalence converge deterministically                         |
| Browser session         | paired relay adapter, session controller, local conversation repository, shared renderer executor extraction and tests                                                              | Live bounded-wait loop, run/call identifiers, claim leases, result ledger, heartbeat states, reload recovery, reply, cooperative stop and disconnect work without UI knowledge or Electron consent changes          |
| Tools and pedagogy      | memory tools, `registry.ts`, scope resolver, tool session, instruction bundle, bootstrap instruction and tests                                                                      | Memory permissions and ownership resolve correctly; one-shot destructive approval is consumed; bootstrap starts the live loop; returned bundle contains conditional misconception-first, grounding and safety rules |

Workers share a repository but are not alone in it. Each brief must name exclusive paths, forbid
reverting other work, forbid nested subagents, and require adjustment to the foundation rather than
replacement of it. No two workers edit `AppShell.tsx`, `Sidebar.tsx`, `schema.ts`, `portability.ts`,
`registry.ts` or `App.tsx` concurrently.

### Day 4 — integration and high-value actions

**Status: delivered.** A real terminal run invoked the shared domain tools to create a Course,
Lesson, Concept, Card, fixed Question and checkpoint assessment. It used exact Course approval and
one course-scoped write grant, replayed the assessment's `callId` without duplication, verified the
saved counts and rendered linked receipts for each authored record.

The orchestrator integrates the four branches and owns `App.tsx`; the tools owner remains the sole
owner of `registry.ts`. Add deliberate receipts for:

- create/update Course;
- create/update Lesson;
- create/update Card;
- create/update fixed or generated Question;
- create/update assessment and final exam date.

Long-tail tools use a generic receipt containing tool name, success/failure and returned identifiers.
Run browser scenario 1 on the first integrated build, including MCP setup copy, pairing and at least
three empty bounded waits before sending the message. Do not wait for the final
day to discover that the terminal cannot actually stay alive or reach the page.

Completion criterion: one real terminal agent pairs, receives a sidebar message, invokes a read
and an approved write through the existing tool registry, and replies with a rendered receipt.

### Day 5 — trust states

**Status: delivered.** Exact-call approval, replay persistence, disconnect revocation, Stop
enforcement, connection recovery, closed-panel activity continuity and replacement/sync
coordination are implemented.

Finish one-shot approval, Undo, stop, reload recovery, connection reset and failure presentation.
Exercise browser scenarios 2, 3 and 5. Verify that:

- stopped runs cannot commit later calls;
- already-committed actions remain accurately reported;
- a rejected or consumed destructive approval cannot be reused;
- reconnect cannot deliver one pending message twice;
- a disconnected agent never leaves the UI claiming it is still working.

### Day 6 — teaching and memory

**Status: delivered.** Scenario 4 passed in the browser with an approved uncertain memory, concrete
failed prediction, learner-evidence resolution and transfer check. The Settings inspector exposed
the resolved record. Repository tests cover peer update, deletion and deliberate resurrection.

Exercise scenario 4 against real course content and memories. Check:

- active and uncertain memories are retrieved with intent rather than dumped wholesale;
- misconception-first is used for conceptual change and skipped for operational requests;
- answer delay survives the multi-turn bridge;
- transfer evidence changes a memory deliberately rather than automatically declaring victory;
- the memory inspector can correct, resolve and delete a mistaken agent inference;
- a two-device peer merge preserves the expected memory update/deletion.

### Day 7 — interaction and visual quality gate

**Status: delivered.** The existing live browser gate passed for pairing, approvals, authored
content, misconception-first teaching, memory correction, peer-sync continuity, unavailable
receipts, full replacement cleanup, stable replay and Stop. The final deterministic interaction
pass covered message claiming, queued-follow-up editing, panel/capsule transitions, approval,
receipt, reply, Stop, focus restoration and modal suppression through the scripted browser fixture.

Visual checks kept each variable separate instead of multiplying them into a Cartesian-product
matrix:

- widths at 1024, 1440 and 1920 px, with the 1280 px baseline already covered;
- dark theme at 1280 px;
- reduced motion at 1280 px;
- 200% zoom from a wide viewport, including the resulting active-run breakpoint transition and
  compact Stop surface.

The pass found and fixed two defects: generic activity duplicated the `Working` label, and updating
a queued follow-up cleared the saved text from the popover. Both fixes were proved red-to-green and
the continuous interaction pass then completed successfully. Root lint, web and Electron
type-checking, production build, and eight existing AI Playwright scenarios passed. The full unit
run passed 2,547 tests; one unrelated page-visibility test timed out while duplicate suite processes
competed for resources and passed immediately in isolation.

The remaining gate is the normal two-subagent review and CodeRabbit review at PR time. Human visual
sign-off remains required; an accessibility tree cannot judge whether the result looks bolted on.

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
- Paired relay session covers connect, several empty waits, claim leases, `runId` rejection, `callId`
  result replay, heartbeat/quiet states, reload recovery, bounded-wait fallback, cooperative stop and
  deduplicated replies.
- Deterministic Playwright scenarios use a scripted page client for setup, queue, reload,
  permissions, tools, receipts, stop and failure states through the real repositories.
- A recorded instruction-bundle conformance fixture tests misconception-first routing without making
  a probabilistic model response a binary browser regression.
- One manual live MCP companion smoke uses a named harness and model, exercises the six acceptance
  scenarios, records the versions and distinguishes application failures from model behaviour.

Run focused tests during each slice, followed by `bun run lint`, `bun run typecheck`, the full test
suite, the web production build and the browser scenarios. The Electron typecheck and existing MCP
tests remain mandatory even though the new visual surface is web-first.

## Risks and containment

| Risk                                                                       | Containment                                                                                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A generic MCP command still needs one harness-specific configuration entry | Show the exact command and keep the companion standard; package a one-command installer after the prototype proves the transport        |
| A sidebar message cannot wake an idle terminal                             | Copyable bootstrap instruction and a live bounded-wait loop; a genuine wake mechanism remains deferred                                  |
| Browser and terminal race on mailbox generations                           | Keep one writer per directional mailbox and retry only after pulling the winning generation                                             |
| Stop is mistaken for process termination, browser revocation or rollback   | Reject later bridge calls by run token, require bridge-only mutation, show Stop requested/acknowledged, accurate copy and existing Undo |
| AppShell transforms or z-indexes pin/cover the capsule                     | Position inside the shell body; keep AI below modal tiers; browser-check every overlay                                                  |
| The agent infers misconceptions from FSRS weakness                         | Require diagnosis, memory basis and learner-correctable status                                                                          |
| Memory deletion resurrects after sync                                      | Same-transaction tombstone and existing peer-merge semantics                                                                            |
| A weaker model ignores teaching or stop instructions                       | Versioned conformance scenario; do not claim equal capability across models                                                             |
| Four workers edit central files concurrently                               | Exclusive territory and one integration owner                                                                                           |
| UI polish is postponed behind infrastructure                               | UI adapter starts on day 2; browser acceptance begins on day 4                                                                          |

## Deferred beyond the prototype

- Mobile AI.
- Streaming responses.
- Multiple simultaneous agents or conversations.
- Killing arbitrary terminal inference.
- Synchronised conversation transcripts.
- Attachments and binary asset upload.
- Automatic memory consolidation, summarisation and expiry jobs.
- Durable client identity and automatic reconnection across terminal restarts.
- A packaged installer and automatic configuration for individual terminal harnesses.
- Every long-tail tool receiving a bespoke receipt renderer.
- Cross-browser support beyond Chromium for the web prototype.
- A market-facing onboarding flow or explanation of terminal harnesses.

## Delivery documentation

After implementation, update `docs/SPEC.md`, `docs/UX-MAP.html`, `docs/UX-MAP.json`, `docs/PERFORMANCE.md`, README setup,
Help, `docs/CHANGES.md` and `MEMORIES.md` only for non-obvious durable facts future agents would get
wrong. Record measured browser and terminal evidence plus the exact MCP companion version used. Do
not present the prototype as able to wake an idle harness: the required capability is a deliberately
running task that continues the bounded-wait loop.
