# Gaps: teacher insights

The separate [Gaps entry](../src/teacher/main.tsx) renders the shared teacher view
without the learner App, hash router or database. `build:gaps` typechecks the web
source and builds [its Vite configuration](../vite.gaps.config.ts) into `gaps/dist`.
The output contains React, the theme provider, teacher presentation, shared visual
primitives/styles and explicitly selected local fonts/icon. It has no learner
routes, database migration/seed, backup/sync/AI startup, study service worker,
manifest or precache. A small, origin-guarded retirement worker replaces the old
study worker at `/sw.js`; it is not a teacher offline cache. Only the shared theme
preference and saved course connections are read on startup. Connections use an
isolated teacher database; teacher-key setup loads separately on request and
accesses key storage only after an explicit key action.

The view's `children` prop is the seam: the existing in-app
[TeacherHome](../src/pages/TeacherHome.tsx) supplies locally published-course
management, including credential checks; standalone Gaps supplies its separately
saved, verified course connections.
`#/teach` remains available on the main website and desktop, linked from Share.
The standalone build has one view and needs no router. Bare roots and old hashes
such as `#/teach` and `#/share` render that same teacher workspace;
its sharing link explicitly opens the main site.

Standalone Gaps does not automatically migrate or inspect existing courses, credentials or private
keys. It neither opens nor deletes a learner database, clears caches, nor registers
a service worker from its entry. The retirement worker below unregisters only its
own legacy Gaps registration. Its unconnected state does not claim that a preserved
learner library is empty. No reports or participation totals are fabricated.
The connection adapter is independent of learner storage. The entry does not install a pupil transport or collect evidence. Opening a class
loads its workspace separately; reading and decryption happen only after an explicit unlock.

## Connect a published course

In Lacuna’s Share panel, choose **Set up a class in Gaps** above **Connect to Gaps**
to open Gaps with the published course link filled in. Only the public share id is
passed in `#course=<id>`; Gaps removes that hash after prefilling the form and waits
for you to complete class set-up.

In Gaps, choose **Connect a class**, paste any published Lacuna course link and
set a connection passphrase of at least 16 characters. Gaps creates a separate
class link which reads the original publisher’s current course and updates. The
teacher owns only this class’s key and results; they cannot change the source
course. Links to another teacher’s class resolve to the original publisher, so
neither their key nor their results are inherited. Give pupils the new class code
after key setup; the source course link alone does not enrol them in your class.
Save **Download connection file** under **Class settings**, and keep
its passphrase separately. The teacher-key recovery file remains separate.

To restore a saved connection, choose **Use a connection file**. Existing
publisher-owned connections remain supported: on the publishing device, open the
course’s Share page and choose **Connect to Gaps** to export that connection.
Only the shared trial relay, `https://relay.getlacuna.app`, is supported.
The teacher policy permits connections to that relay alone.

Class links forward course bytes and polling metadata without copying or republishing
content. Publisher updates keep linked classes live under the existing expiry
policy. Deleting one class preserves the publisher and other classes; deleting or
expiring the source makes its content unavailable through every class link.
Existing imported copies remain local. The class’s own key and retained results
continue to use its separate ownership and retention rules. Course-file imports
without a recorded source link and previously republished forks are not migrated.

[connectionFile.ts](../src/teacher/connectionFile.ts) defines the bounded,
versioned file. Its ownership token is encrypted with AES-256-GCM using a fresh
nonce and a PBKDF2-HMAC-SHA-256 key. The KDF uses the existing bounded work-factor
policy; a distinct purpose binds the course identifier, relay, course name and
header as authenticated data. Course name and identifier remain visible in the
file. Its passphrase and plaintext token are never written into it. The file
permits offline passphrase guessing, so keep it and a strong passphrase separately
and do not share them with pupils. This is a different file from teacher-key recovery.

[connectionStore.ts](../src/teacher/connectionStore.ts) opens only
`lacuna.gaps.connections`. File import decrypts locally, checks the existing owner
credential with an uncached HEAD, then commits the encrypted file and verification
time. Link-based creation validates the source manifest, mints a source-linked
class, checks its forwarded manifest and ownership, then commits only encrypted
credentials. A failed local commit attempts to delete only the newly minted class;
if cleanup cannot reach the relay, its unexposed id expires normally. Failed decryption, failed verification, cancellation before saving or a failed
commit cannot confirm a connection. No course bytes are uploaded or republished.
The plaintext token exists transiently to make the owner request; it is not saved.
The course list shows when ownership was checked, not a promise of permanent access.
Reloading lists local connections without sending credentials again.

The workspace follows the study app's layout: a collapsible sidebar lists **Today** and each
class. Connecting a class expands its button into a form; unlock, setup, settings and evidence
open in place. **Today** shows each class with one default
next step (the first locked class is the primary action) and, for unlocked classes, the latest
day's summary. A newly connected class opens setup with its course already selected; opening a
locked class asks for both passphrases unless it is remembered on this device. Setup keeps recovery separate from the connection file
and rejects recovery files belonging to another selected class. **Recover a class** in the
sidebar opens restore without a selected class. After requesting a recovery download, the
teacher can continue to unlock and share a class code. Unlocked classes start on daily results;
the class code is a separate **Invite** tab. Motion is CSS-only and respects reduced motion.
**Remove connection** asks for confirmation, then deletes that browser's connection and remembered credentials: it preserves
the published share, teacher key, recovery files and pupil copies. A saved connection
file can be imported again with fresh verification. Clearing browser storage still
requires the separate teacher-key recovery file and passphrase to recover that key.
Connecting a course does not publish its teacher key or enable pupil results.

## Agreed trial boundaries

The forwardable [school data notice](gaps-school-notice.md) describes the current web
trial in plain English. The [teacher walkthrough](gaps-teacher-walkthrough.md) is ready
for a later human session; the [operations procedure](gaps-trial-operations.md) covers
delivery, maintenance and spending. These are not claims that a teacher usability
session or the first real class's follow-through has been completed.

The owner approved the four defaults from [#600](https://github.com/TJ7755/Lacuna/issues/600):

- An opaque relay mailbox retains submissions for 12 weeks; fetching does not delete them.
- Disclose the course, UTC reporting day, submission time and packet size visible to the service.
- Recover the teacher key using an offline passphrase and a saved encrypted recovery file.
- Do not display keyless participation counters in v1.

Ordinary builds leave `VITE_GAPS_REPORTING_ENABLED` unset, so no pupil transport
is installed. Explicit trial builds set it to `true`; the relay separately requires
`RELAY_INSIGHTS_ENABLED=1`. Neither gate is activated by connecting a course or
publishing an invitation, and neither replaces explicit pupil consent.

The production web trial was enabled on 19 October 2026 after the owner confirmed
their human review and approval and requested an additional Sol review. That AI
review found a UTC-midnight reporting defect; the fix passed a follow-up review
and the complete CI gate before activation. This is not a formal security audit.
Production `lacuna` sets `VITE_GAPS_REPORTING_ENABLED=true`; production
`lacuna-relay` sets `RELAY_INSIGHTS_ENABLED=1`. Desktop builds were not activated.
The [activation record](review-evidence/gaps-trial-activation/README.md) identifies
the released source, deployments and live verification. Relay expiry cannot erase
results already retained by a teacher.

The trial is one class of about 30 pupils. The owner subsequently chose daily
delivery. The planner permits one report for the latest completed UTC day and
does not backfill days skipped while offline. Its acknowledgement is device-local
and advances only after upload acceptance. The previous experimental weekly
marker is not a daily acknowledgement. The old weekly keyless summariser remains
unused; it is not the encrypted evidence format.

## Encrypted daily envelopes

Pupils can type an eight-character class code, which the relay looks up to find the
class share. Lookups are limited to 600 per hour per address. Short-code joins trust
the relay to return the teacher key; the join link and QR keep the full pinned
teacher-key fingerprint.

Class invitations bind the share id to the complete SHA-256 fingerprint of the
teacher's encryption key. [classCode.ts](../src/insights/classCode.ts) produces a
versioned pasteable code and accepts the same code in a share URL. Pupils must
obtain it directly from their teacher. [classKey.ts](../src/insights/classKey.ts)
accepts only a matching, valid RSA recipient fetched from the share's public
`teacher` slot. That slot uses existing owner authentication, compare-and-swap,
the 8 KiB metadata limit and the share's expiry/deletion rules. Course republishes
do not overwrite it. Publication refuses a different existing key; key rotation
remains a separate explicit operation.

The independently supplied fingerprint authenticates the recipient without an
additional signing key. A key downloaded from the relay alone is insufficient.
This replaces the proposal's unimplemented public-key signature with an explicit
invitation trust anchor. It does not protect a pupil who obtains a substituted
invitation or runs compromised application code. Ordinary course links without a
pinned teacher fingerprint cannot enrol a device for encrypted reporting.
These helpers do not install collection or change the relay's activation gate.

[envelope.ts](../src/insights/envelope.ts) is an isolated WebCrypto spike with
synthetic evidence tests. It generates a per-share RSA-OAEP/SHA-256 3072-bit
recipient key. Each submission gets a fresh 256-bit AES-GCM key and random
96-bit nonce. RSA-OAEP wraps the AES key. Both the OAEP label and GCM associated
data bind the versioned purpose, share id, UTC reporting day and SHA-256 fingerprint
of the teacher public key. Ciphertext authentication happens on the teacher's
device: a keyless relay can check declared routing fields, but cannot verify
their cryptographic binding or prove a submission is genuine.

The recovery file wraps the PKCS#8 private key with AES-GCM under a
PBKDF2-HMAC-SHA-256 key, reusing the sync module's iteration policy and bounded
work factor. Its associated data binds the share, recipient and recovery header.
Recovered in-memory private keys are non-exportable. The function persists
nothing and never sends the passphrase. Possession of the recovery file permits
offline passphrase guessing; a short PIN is inadequate. A passphrase alone
cannot recreate the random teacher key: the encrypted recovery file is required.
Recovery proves that the decrypted private key matches the advertised public key
before returning it or replacing any saved recovery material.

The daily envelope uses experimental version 2; the unactivated weekly version 1
is rejected. Recovery files remain version 1 because their format has not changed.

Desktop safeStorage and key rotation remain separate work. The production web
trial uses the reviewed flow and approval recorded above. The public key is trusted only
through the teacher invitation described above. Anyone holding an authentic public key
can encrypt a fabricated result. The spike bounds evidence to 64 KiB and rejects
unknown fields and versions; this provisional format is not a released contract.

## Pupil consent and daily evidence

A verified class invitation enrols only the imported course with the matching
lineage. [enrolment.ts](../src/insights/enrolment.ts) stores the pinned recipient,
random course/device identifier and explicit consent locally. Ordinary share links
and legacy experimental toggle values cannot grant reporting consent. Rejoining
the same class preserves the choice; replacing its teacher key is refused.

The join page and course settings show the evidence and metadata disclosure before
consent. The pupil supplies a name or class identifier, which is encrypted with the
results. It is self-reported and device-specific, not authenticated pupil identity.
Consent includes yesterday’s recorded activity. Opt-out stops future sends and
aborts an active upload, but cannot retract a packet already accepted by the relay.

[evidence.ts](../src/insights/evidence.ts) defines a strict versioned plaintext
schema, separate from the encrypted envelope version. It carries recorded prompts,
answers, marks, criterion detail, recall, marking method and disputes, bounded to
200 activities and 64 KiB. [collectEvidence.ts](../src/insights/collectEvidence.ts)
reads only the selected course and UTC day in a readonly transaction. Undone
questions, reconstructed legacy Question receipts and incomplete papers are excluded.
Genuine Card recall history can still be reported without inventing its old prompt.
Multiple-choice paper answers resolve selected identifiers against the immutable
receipt's option text; unknown identifiers are explicitly labelled. Unknown/withheld marks stay unknown;
self-marked paper evidence is labelled. Card recall does not reinterpret an old
mark scheme from mutable current card text. Text and criterion limits are disclosed,
and omitted activity is a lower bound, not a completeness claim. Private notes,
annotations and reflections are excluded.

[delivery.ts](../src/insights/delivery.ts) checks explicit consent, the imported
course mapping and lineage, then uses the existing durable encrypted outbox.
Automatic failures back off for an hour on each device; course settings offers an
explicit retry. At most one accepted packet is sent per latest completed UTC day,
with no backfill. The application must be open and online. The accepted-day marker
is updated only after the outbox acknowledgement commits.

## Teacher class workspace

The lazy [class workspace](../src/teacher/TeacherClassReports.tsx) explicitly unlocks
the encrypted connection and teacher key using their respective passphrases, or reopens remembered
credentials on this device. Unlocking reads
the latest completed day; stepping to another of the 84 retained days reads that day, after a
short pause so stepping through several days makes one request. Each day read is kept for the
session, so returning to it makes no request. It
publishes only the public recipient to produce the class code/link. Neither teacher
credential file belongs in a pupil invitation.

[readReports.ts](../src/teacher/readReports.ts) reads bounded mailbox pages and
decrypts locally. Repeated cursors/slots and excess pages fail. Unreadable encrypted
packets are reported separately; they never become zero scores. The screen shows
one day’s device reports as a pupil-by-item grid, weakest items first (each pupil counts once
per item), with grouped identical answers and per-activity/criterion detail, preserving unknown,
self-marked, shortened and disputed evidence. Missing reports do not imply no study
or absence. A class-code holder can fabricate results; these are study signals,
not verified attainment or attendance. There are no keyless participation counters.

Decrypted reports remain in this tab's memory until the class is locked, closed or removed,
or the tab is closed. Moving between **Today** and classes keeps that session. Reports are
never persisted in plaintext. Leaving a class aborts its outstanding requests; locking,
closing or removing also drops its session. Opening Gaps never opens the learner database.

**Remember this class on this device** is checked by default when unlocking. A remembered
class reopens without either passphrase, including after a reload or in another tab.
**Close** drops the tab session and returns to **Today**, keeping remembered credentials.
**Forget on this device** asks for confirmation, deletes those credentials and closes the
class; the next opening asks for both passphrases. It leaves the class, reports and recovery
file intact. **Remove connection** also deletes remembered credentials. Without remembering,
**Lock** keeps its existing behaviour and leaves the unlock form open.

## Isolated teacher-key storage

[ownerStore.ts](../src/insights/ownerStore.ts) uses `lacuna.gaps.owner-keys` IndexedDB;
[connectionStore.ts](../src/teacher/connectionStore.ts) uses `lacuna.gaps.connections`.
Neither opens learner storage. Version 2 adds device credential tables without changing
connection or recovery files. The teacher's already non-extractable RSA-OAEP `CryptoKey`
is stored directly by structured clone with its `keyId`, beside the encrypted recovery.
Reading checks that `keyId` against the saved recovery recipient; a mismatch deletes the
remembered entry and returns to passphrase unlock.

The connection write token is encrypted with AES-GCM-256 using a per-database,
non-extractable device `CryptoKey`, also stored by structured clone. Every write uses a fresh
96-bit nonce and additional authenticated data `lacuna-gaps-device-v1|<shareId>`. Rows contain
ciphertext, nonce and non-secret metadata, never passphrases, raw key bytes or plaintext
tokens. WebCrypto finishes before Dexie write transactions. If storing a `CryptoKey` fails,
unlock still succeeds but remembering silently falls back to the existing passphrase flow.
No network request or device synchronisation is involved in remembering.

Anyone with access to this browser profile can open remembered classes, like a signed-in
email account. The device key protects stored token bytes; it does not protect against
someone using the same profile. Keep recovery and connection files with their passphrases
separately for another device or cleared browser storage.

Creation returns only after its database transaction commits. Concurrent creates
cannot silently replace one another. Restoring a recovery file verifies the
passphrase and course binding before writing; restoring another key over an
existing course is refused, preserving access to old envelopes. Rotation requires
a separate explicit workflow. Restoring the same key is permitted.

The standalone [key setup](../src/teacher/TeacherKeySetup.tsx) uses this helper after
an explicit create, restore or saved-file action. Its code and database are not
opened with the preparation screen. New keys require a matching passphrase of at
least 16 characters; recovery still accepts earlier passphrases so an existing
key is not locked out by the new-key rule. The view retains only the encrypted
recovery material after each operation and clears passphrase inputs.

The [recovery-file wrapper](../src/insights/recoveryFile.ts) carries its public
course binding and encrypted recovery material in a bounded, versioned JSON file.
Unknown fields, unsupported versions and excessive work factors are refused
before recovery. The passphrase and raw private key are not included. Import
verifies the passphrase, course binding and key pair before saving; a wrong file
cannot silently replace a different saved key. An existing saved key can produce
another recovery download after explicit passphrase verification.

Preparing a key does not prove ownership or connect a course. This workflow does
not migrate share write credentials between origins, publish a public key or stop
the browser clearing local storage. Keep the encrypted recovery file separately;
the passphrase alone remains insufficient.

## Relay mailbox and delivery seam

The existing share owner credential can be checked with `HEAD /shares/:shareId`.
It returns 204 for a live share and matching bearer token, 401 for a missing or
wrong credential, 404 for a missing share or invalid identifier, and 410 for an
expired share whose credential still matches. These responses have no body and
use `Cache-Control: no-store`. Verification never writes, refreshes expiry or
deletes stored objects. This is a point-in-time check, not a lasting grant:
subsequent owner requests must still authenticate. A public share link alone
does not prove ownership.

[verifyShareOwner](../src/shareLinks/client.ts) performs that check with a
15-second timeout and optional cancellation. It sends the credential only in the
bearer header, refuses redirects and accepts only 204. Gaps calls it explicitly
when importing a connection file.

[insights.ts](../relay/src/insights.ts) implements the opaque mailbox behind
`RELAY_INSIGHTS_ENABLED=1`. Without that explicit setting, insight routes return
503 before accessing storage. No deployment or environment change should turn it
on merely because the transport tests pass.

- `PUT /insights/:shareId/:day/:slotId` accepts only a strict daily encrypted
  envelope for that course and completed day. Identifiers are 32 lowercase hex
  characters. The body is limited to 90 KiB, including encryption and JSON overhead.
- Slots are immutable. An exact retry returns 204; different bytes in the same
  slot return 409. A caller must save and retry the same ciphertext and slot after
  losing an acknowledgement. Resealing would create a different packet.
- Admission reserves at most 50 slots per course and day through the existing
  Blob compare-and-swap mechanism. Failed or concurrent duplicate uploads can
  consume a reservation; capacity is deliberately conservative. This is an
  operational cap, not proof of 50 distinct pupils or genuine submissions.
- Reads and writes share a 100-request hourly limit per trusted client IP,
  allowing one 30-pupil class behind a school address. Uploads require a live
  published share. Reads require its existing owner write token and remain
  available for retained reports after the public share expires.
- `GET /insights/:shareId/:day` returns at most 16 envelopes and an opaque cursor,
  with no participation totals. Fetching preserves the envelopes. Responses use
  `Cache-Control: no-store`. Explicit owner deletion of a share also removes its
  insight objects, including when the public share has already expired.

Automatic share expiry does not shorten an accepted report's retention. The
public course link still expires after the existing inactivity window and stops
accepting reports. Its stored share objects and owner authorisation remain until
the last report expires, so the teacher can fetch retained history. Automatic
share cleanup can then reclaim both. An unauthenticated request to delete or
republish an expired share cannot erase those retained reports.

An envelope expires 84 days after the end of its reporting day, regardless of
upload or retry time. Reads and writes then return 410. The existing daily
maintenance job scans up to 500 insight objects per invocation with a persistent
cursor; physical deletion follows when that scan reaches them. This means
physical removal can lag logical expiry, especially with more classes. Retention
wording must preserve that distinction before a school trial.

[mailbox.ts](../src/insights/mailbox.ts) is an explicit client transport, tested
against the real relay handler with synthetic encrypted evidence. It validates
destinations and responses, bounds streamed response size, supports cancellation
and times out after 15 seconds. The gated pupil delivery runtime collects evidence
and uses this client; the teacher workspace uses its authenticated read path.

[outbox.ts](../src/insights/outbox.ts) supplies explicit daily delivery through a
separate pupil-side IndexedDB database, `lacuna.insights.outbox`. It saves only
the encrypted packet and its routing identity before making a request. Concurrent
tabs use the same committed slot and ciphertext. A lost reply, reload or failed
acknowledgement commit retries that packet instead of resealing evidence. An
accepted upload leaves a durable acknowledgement without the ciphertext, preventing
a restart from sending again that day. An ambiguous failed upload can still have
reached the relay; the immutable retry slot resolves that uncertainty.

Consent is checked before collection and again before sending; an explicit abort
signal can cancel an in-flight request. Opt-out holds a pending packet locally
without uploading it, so opting back in on the same day cannot silently create a
duplicate. New packets target only the latest completed UTC day and prune older
local packets and acknowledgements; missed days are not backfilled. Cleanup runs
when a new packet is saved, not while the application is closed. Changing the relay
or teacher key for an existing packet fails rather than redirecting it. The helper
does not open the learner database and persists no plaintext evidence, teacher
secret or ownership credential.
Lacuna installs the delivery runtime only in an explicitly enabled trial build.
Gaps never installs pupil delivery. The production web trial is enabled as described
above; ordinary builds retain the default-off boundary.

## Disable the trial

Confirm the intended team and projects before changing production configuration.
Set production `RELAY_INSIGHTS_ENABLED=0` on `lacuna-relay` and
`VITE_GAPS_REPORTING_ENABLED=false` on `lacuna`, or remove those production values.
Changing a saved variable does not change an already deployed build: deploy the
reviewed source with those disabled values, or roll back to verified production
deployments that captured disabled gates. Stop relay admission first, then pupil
delivery. The relay gate disables report reads as well as uploads; retained
ciphertext remains stored. Failed uploads retain the existing encrypted retry packet.

Use `bunx vercel rollback` with the exact selected production deployment URL and
the verified team scope. The activation record retains the initial fallback
deployments; for later releases, check compatibility before reverting learner code.
Disabling the saved values as well prevents a later automatic build from silently
reactivating reporting. Rollback disables collection; it does not erase retained
reports, teacher keys or pupil data. Keep the teacher hostname, retirement worker
and existing storage intact.

## Trial cost assumptions

At 30 pupils and one accepted upload each day, a 30-day month has at most 900
submissions before retries. The normal uncontended upload takes three Blob writes:
an IP counter, a capacity reservation and the envelope. That is about 2,700 paid
advanced operations, plus teacher reads, listing and maintenance. At the published
$5 per million advanced operations, those writes alone cost about $0.014. This
already exceeds Hobby's 2,000 included advanced operations; the current design
does not claim to fit that free-plan limit.

At the maximum envelope size, 30 pupils over 84 retained days use less than
0.24 GB of ciphertext, before cleanup lag. Storage, transfer, requests and function
time remain usage-based. A conservative planning estimate is under $1/month for
normal trial traffic, excluding app builds, other projects, abuse and any future
AI service. This is an estimate, not a spending cap. The existing Pro account's
$20 monthly infrastructure credit is shared across projects; excess usage is
billed on demand. No extra database or AI service is required for this mailbox.

Pricing references: [Blob usage and pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
and [Pro plan](https://vercel.com/docs/plans/pro-plan). Check current rates and
account-wide remaining credit before enabling the trial.

## Hosting

`https://gaps.getlacuna.app` serves the separate static `lacuna-gaps` Vercel project.
`teach.getlacuna.app` redirects to it. Both teacher hostnames belong to that project;
neither is assigned to a learner branch. The `lacuna` project continues to serve
`getlacuna.app` with the root [Vercel configuration](../vercel.json).
Changing that shared project's build command would also change Lacuna: do not do that.

The Gaps project is connected to this repository with production branch `master`,
Root Directory `gaps` and source files outside that directory included
([Vercel monorepo procedure](https://vercel.com/docs/monorepos/monorepo-faq)).
[gaps/vercel.json](../gaps/vercel.json) owns its static deployment settings.
Its install/build commands run in the repository parent with Bun 1.4.3 and the frozen
root lockfile; output is `dist` relative to `gaps`. The teacher root contains no
`api` directory. Hosting the teacher workspace does not activate pupil delivery.

The remote Ignored Build Step runs production builds and skips automatic previews:

```sh
if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
```

This avoids an extra teacher build for every PR in the monorepo. Use an explicit,
authorised staged production deployment for publication checks. Inspect the linked
project and team before deploying; a local link to `lacuna` is the wrong target.
Stage with `bunx vercel deploy --prod --skip-domain`, verify the returned deployment
with `bunx vercel curl`, then promote that exact production deployment. Deployment
protection remains enabled for generated URLs; the production teacher domain is public.

For a hostname reassignment, Vercel's project-domain move endpoint also moves
redirects pointing to that hostname. Use it with the explicit destination project
and `gitBranch: null`; removing a domain with `domains add --force` fails while a
redirect points to it. Preserve the old project, branch assignment and deployment
before moving a hostname so that a failed cutover can be reversed. Later teacher
releases can roll back to a previous ready production deployment in `lacuna-gaps`.
Do not change the learner project's build, other hostnames or relay activation gates.

Before publication, inspect the generated file list and run:

```bash
bun run build:gaps
PLAYWRIGHT_WEB_PORT=4317 bun run verify:browser -- --gaps --project=chromium gaps-standalone.spec.ts gaps-worker-migration.spec.ts gaps-teacher-keys.spec.ts gaps-course-connection.spec.ts
PLAYWRIGHT_WEB_PORT=4327 bun run verify:browser -- --project=chromium gaps-entry.spec.ts landing-preview.spec.ts
VITE_GAPS_REPORTING_ENABLED=true PLAYWRIGHT_WEB_PORT=4337 bun run verify:browser -- --project=chromium gaps-daily-flow.spec.ts
```

Stage intended new files before browser verification. `--gaps` selects the teacher
build/config within the existing isolated runner; each run owns its output, source
fingerprint and browser evidence. Without the flag the runner still checks Lacuna.
The build-graph test fails if learner modules, workers or extra JavaScript entries
enter Gaps. The initial JavaScript remains bounded to 80 kB compressed; explicit
key setup and class reports load separate chunks, with a 160 kB combined budget.
The graph check keeps key storage and crypto out of the initial import closure.
Browser checks record storage,
worker/database calls, requests and desktop/mobile screenshots.
The first functional browser shard also runs the standalone checks in CI, so
teacher-key recovery participates in the existing required browser gate.

The [retirement worker](../gaps/sw.js) occupies the old `/sw.js` URL so returning
browsers can update the root-scoped Workbox registration even while it serves an
old cached shell. Installation succeeds only for that worker path and root
scope on `https://gaps.getlacuna.app`. It takes control, unregisters itself and
refreshes only the old teacher home/bare root; other learner views stay open until
their next navigation to avoid discarding edits. It has no fetch handler and never
opens/deletes IndexedDB or deletes caches. No learner worker on `getlacuna.app` is
registered, claimed or unregistered. Serve `/sw.js` with `no-store` and retain this
retirement asset through the migration window; removing it early strands browsers
that have not returned yet. The existing cached study assets may remain on disk.

Before moving the hostname, verify a preview and then the production origin with
both a fresh profile and an existing installation. The latter must update its old
registration; a browser that delays worker updates may require a reload. Check
bare root, old hashes, preserved course data, missing assets (must not return HTML),
sharing and the main site's study/desktop behaviour. The migration browser test
installs a cached learner-shell fixture on the real Gaps hostname through local interception, updates it to the candidate worker and
checks that course data and the separate main-site worker survive. The test changes
only the worker URL query because Chromium background update fetches bypass
Playwright routing; it exercises the same registration takeover and activation.
It does not prove the remote assignment or update timing of an existing production installation.

The branch carries separate increments for the teacher entry, encryption,
daily cadence, relay mailbox and client transport. Their tests cover crypto,
admission races, expiry, revocation and transport failures, so the combined branch
exceeds the usual handwritten-line target. Review these layers separately; do
not merge the school-trial epic as one undifferentiated change. The separate
production gates control collection, and the authoring agent's checks do not
replace human review and approval.
