# Gaps: teacher insights

The separate [Gaps entry](../src/teacher/main.tsx) renders the shared teacher view
without the learner App, hash router or database. `build:gaps` typechecks the web
source and builds [its Vite configuration](../vite.gaps.config.ts) into `gaps/dist`.
The output contains React, the theme provider, teacher presentation, shared visual
primitives/styles and explicitly selected local fonts/icon. It has no learner
routes, database migration/seed, backup/sync/AI startup, study service worker,
manifest or precache. A small, origin-guarded retirement worker replaces the old
study worker at `/sw.js`; it is not a teacher offline cache. Only the shared theme
preference is read/written locally.

The view's `children` prop is the seam: the existing in-app
[TeacherHome](../src/pages/TeacherHome.tsx) supplies locally published-course
management, including credential checks; standalone Gaps supplies no data source.
`#/teach` remains available on the main website and desktop, linked from Share.
The standalone build has one view and needs no router. Bare roots and old hashes
such as `#/teach` and `#/share` render that same honest, unconnected teacher view;
its sharing link explicitly opens the main site.

Standalone Gaps does not migrate or inspect existing courses, credentials or private
keys. It neither opens nor deletes a learner database, clears caches, nor registers
a service worker from its entry. The retirement worker below unregisters only its
own legacy Gaps registration. Its unconnected state does not claim that a preserved
learner library is empty. No reports or participation totals are fabricated.
A future teacher data adapter must be independent of learner storage and supply
verified teacher content at this seam. Reuse the existing insights envelope/mailbox
modules when needed; this entry does not install a transport or implement key
recovery, evidence collection or decryption. Those integration steps remain separate.

## Agreed trial boundaries

The owner approved the four defaults from [#600](https://github.com/TJ7755/Lacuna/issues/600):

- An opaque relay mailbox retains submissions for 12 weeks; fetching does not delete them.
- Disclose the course, UTC reporting day, submission time and packet size visible to the service.
- Recover the teacher key using an offline passphrase and a saved encrypted recovery file.
- Do not display keyless participation counters in v1.

These are implementation decisions, not claims that the pipeline is live. The
current opt-in records consent locally; no transport is installed and no pupil
results leave the device. The teacher entry says this explicitly. Relay expiry
will not erase results a teacher has already decrypted and retained.

The trial is one class of about 30 pupils. The owner subsequently chose daily
delivery. The planner permits one report for the latest completed UTC day and
does not backfill days skipped while offline. Its acknowledgement is device-local
and advances only after upload acceptance. The previous experimental weekly
marker is not a daily acknowledgement. The old weekly keyless summariser remains
unused; it is not the encrypted evidence format.

## Encrypted daily envelopes

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

The daily envelope uses experimental version 2; the unactivated weekly version 1
is rejected. Recovery files remain version 1 because their format has not changed.

This does not yet implement a signing trust root, key publication, a key-management
UI, desktop safeStorage, rotation, evidence schema or teacher decryption UI.
Do not enable pupil delivery until those pieces and
independent human security review are complete. Trust in the public key still
depends on the course-distribution path; encryption alone does not prevent an
active service from substituting a key. Anyone holding an authentic public key
can encrypt a fabricated result. The spike bounds evidence to 64 KiB and rejects
unknown fields and versions; this provisional format is not a released contract.

## Isolated teacher-key storage

[ownerStore.ts](../src/insights/ownerStore.ts) uses a separate
`lacuna.gaps.owner-keys` IndexedDB database. It imports no learner database or
startup code. Records contain only the share id and encrypted recovery material;
neither the passphrase nor an unencrypted private key is persisted. Unlocking is
explicit and yields a non-exportable in-memory private key. No network request
or device synchronisation is involved.

Creation returns only after its database transaction commits. Concurrent creates
cannot silently replace one another. Restoring a recovery file verifies the
passphrase and course binding before writing; restoring another key over an
existing course is refused, preserving access to old envelopes. Rotation requires
a separate explicit workflow. Restoring the same key is permitted.

This helper is not installed by either application yet. It does not migrate
share write credentials between origins, publish a public key, provide an offline
recovery-file download or stop the browser clearing local storage. Keep the
encrypted recovery file separately; the passphrase alone remains insufficient.

## Relay mailbox and delivery seam

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
  allowing one 30-pupil class behind a school address. They require a live
  published share; reading also requires its existing owner write token.
- `GET /insights/:shareId/:day` returns at most 16 envelopes and an opaque cursor,
  with no participation totals. Fetching preserves the envelopes. Responses use
  `Cache-Control: no-store`. Deleting a share also removes its insight objects.

An envelope expires 84 days after the end of its reporting day, regardless of
upload or retry time. Reads and writes then return 410. The existing daily
maintenance job scans up to 500 insight objects per invocation with a persistent
cursor; physical deletion follows when that scan reaches them. This means
physical removal can lag logical expiry, especially with more classes. Retention
wording must preserve that distinction before a school trial.

[mailbox.ts](../src/insights/mailbox.ts) is an explicit client transport, tested
against the real relay handler with synthetic encrypted evidence. It validates
destinations and responses, bounds streamed response size, supports cancellation
and times out after 15 seconds. No application caller installs it or collects
evidence yet. Persistent retry packets and key lifecycle belong in the next slice.

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

The currently published Gaps alias still uses the Lacuna project and full build,
with `feature/594-gaps` assigned to the Gaps domain. `teach.getlacuna.app` redirects
to it. The root [Vercel configuration](../vercel.json), main build and hostname
fallback remain intact until a reviewed publication switches the teacher hostname.
Changing a shared project's build command would also change Lacuna: do not do that.

[gaps/vercel.json](../gaps/vercel.json) prepares a separate static Gaps deployment.
For a later authorised publication, use a separate Gaps deployment target with
repository Root Directory `gaps` and source files outside that directory included
([Vercel monorepo procedure](https://vercel.com/docs/monorepos/monorepo-faq)).
Its install/build commands run in the repository parent with Bun 1.4.3 and the frozen
root lockfile; output is `dist` relative to `gaps`. The teacher root contains no
`api` directory.
Check those settings against a preview before moving any hostname. No relay switch,
new secret, environment change or paid service is needed for this unconnected view.
This change does not create/configure a remote project, deploy or move domains.

Before publication, inspect the generated file list and run:

```bash
bun run build:gaps
PLAYWRIGHT_WEB_PORT=4327 bun run verify:browser -- --gaps --project=chromium gaps-standalone.spec.ts gaps-worker-migration.spec.ts
PLAYWRIGHT_WEB_PORT=4327 bun run verify:browser -- --project=chromium gaps-entry.spec.ts landing-preview.spec.ts
```

Stage intended new files before browser verification. `--gaps` selects the teacher
build/config within the existing isolated runner; each run owns its output, source
fingerprint and browser evidence. Without the flag the runner still checks Lacuna.
The build-graph test fails if learner modules, workers or extra JavaScript entries
enter Gaps, and limits compressed JavaScript to 80 kB. Browser checks record storage,
worker/database calls, requests and desktop/mobile screenshots.

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
not merge the school-trial epic as one undifferentiated change. None activates
data collection, and the authoring agent is not the independent security reviewer.
