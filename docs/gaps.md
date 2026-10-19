# Gaps: teacher insights

Gaps uses the existing Lacuna web build. `gaps.getlacuna.app` opens `#/teach` before
the study landing page paints. Explicit app hash routes still work. `#/teach` also
works on the main website and desktop; Share links to it.

The teacher entry lists locally published courses and checks for the existing
share write credentials before offering sharing management. Its empty state
explains that Gaps, the main website and desktop have separate storage. Opening
the new domain does not migrate courses, write tokens or private keys.

## Agreed trial boundaries

The owner approved the four defaults from [#600](https://github.com/TJ7755/Lacuna/issues/600):

- An opaque relay mailbox retains submissions for 12 weeks; fetching does not delete them.
- Disclose the course, ISO week, submission time and packet size visible to the service.
- Recover the teacher key using an offline passphrase and a saved encrypted recovery file.
- Do not display keyless participation counters in v1.

These are implementation decisions, not claims that the pipeline is live. The
current opt-in records consent locally; no transport is installed and no pupil
results leave the device. The teacher entry says this explicitly. Relay expiry
will not erase results a teacher has already decrypted and retained.

## Encryption spike

[envelope.ts](../src/insights/envelope.ts) is an isolated WebCrypto spike with
synthetic evidence tests. It generates a per-share RSA-OAEP/SHA-256 3072-bit
recipient key. Each submission gets a fresh 256-bit AES-GCM key and random
96-bit nonce. RSA-OAEP wraps the AES key. Both the OAEP label and GCM associated
data bind the versioned purpose, share id, UTC ISO week and SHA-256 fingerprint
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

This does not yet implement a signing trust root, key publication, storage in
IndexedDB or desktop safeStorage, rotation, evidence schema, mailbox endpoints
or teacher decryption UI. Do not enable pupil delivery until those pieces and
independent human security review are complete. Trust in the public key still
depends on the course-distribution path; encryption alone does not prevent an
active service from substituting a key. Anyone holding an authentic public key
can encrypt a fabricated result. The spike bounds evidence to 64 KiB and rejects
unknown fields and versions; this provisional format is not a released contract.

## Hosting

The Lacuna Vercel project's Gaps domain is assigned to `feature/594-gaps`.
`teach.getlacuna.app` redirects to Gaps. Keep that branch assignment and the
project's allowed preview build branch in step. No DNS change is needed for the
teacher entry. Validate the deployed hostname's bare root and an explicit hash
route after publishing the branch; a local build does not prove the remote alias.

The first increment spans two boundaries: an independently testable encryption
spike for #600 and the teacher entry for #592. Neither activates data collection.
Keep subsequent relay, key lifecycle and evidence-delivery changes in separate
reviewable slices rather than treating the school-trial epic as one merge.
