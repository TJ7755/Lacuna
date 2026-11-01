# Course library operations

## Publish a frozen artefact

Complete the sol-loop skill’s independent review of the exact frozen candidate and its build/import/update
checks before publishing. Record the accepted SHA-256 separately from historical draft fields.
Source booleans do not authorise publication. Supply that accepted hash to the existing publisher.

Supply ownership through `LACUNA_RELAY_URL` and `LACUNA_WRITE_TOKEN` in the process environment,
or `--credentials "$LACUNA_OWNER_FILE"`. The latter is a JSON file outside the repository,
including after resolving symbolic links, with this shape:

```json
{ "relayUrl": "http://127.0.0.1:4999", "writeToken": "<64 lowercase hexadecimal digits>" }
```

Use the relay that owns the existing share. No relay or token is inferred from its public URL.
Keep this file outside every checkout, restrict access to its owner and inject environment
credentials through your secret manager. Never paste tokens into command arguments, commit them,
include them in review evidence or enable shell tracing. HTTP is accepted only for loopback relays;
remote relays require HTTPS. The command suppresses private exception/relay response text.

Use the catalogue course id for `--course-id`; it is an operator label, not a rewritten payload
identity. With the variables below pointing to external files and a synthetic stable link:

```bash
bun scripts/library-publish.ts --artefact "$FROZEN_ARTEFACT" --course-id synthetic \
  --share "$STABLE_SHARE_URL" --credentials "$LACUNA_OWNER_FILE" --dry-run
```

Review the dry-run plan and record the exact frozen artefact hash in private approval evidence.
Supply that hash for publication:

```bash
bun scripts/library-publish.ts --artefact "$FROZEN_ARTEFACT" --course-id synthetic \
  --share "$STABLE_SHARE_URL" --credentials "$LACUNA_OWNER_FILE" \
  --approved-sha256 "$APPROVED_SHA256" > "$PUBLICATION_RECORD"
```

Serialise publishers for each share. The existing protocol writes payload then manifest, with
separate generation/compare-and-swap checks; it is not a two-slot transaction. A failure can leave
a new payload with an old/missing manifest, or an accepted write whose response was lost. Errors
identify the failing phase and do not claim rollback. Stop other publishers, run dry-run with the
same frozen artefact and inspect the plan before retrying. Matching payload bytes are not resent;
only a missing/outdated manifest is repaired. A 412 conflict is never automatically overwritten.
If another publisher advanced the revision, investigate that publication rather than forcing an
older artefact over it. Verification failures may occur after both slots are live: inspect them
before retrying, and do not treat the failed run as publication evidence.

## Hosting

Create a separate Vercel project named `lacuna-library`, connected to this repository.
Set its Root Directory to `apps/library`, production branch to `master`, and enable
**Include source files outside of the Root Directory in the Build Step**. That setting
allows the entry to reuse Lacuna's fonts, styles and React components
([Vercel monorepo guidance](https://vercel.com/docs/monorepos/monorepo-faq#can-i-share-source-files-between-projects-are-shared-packages-supported)).

[apps/library/vercel.json](../apps/library/vercel.json) supplies the install/build commands and
`dist` output directory. Assign `library.getlacuna.app` to that project's Production
environment. Apply the other workspace root changes in the [deployment procedure](maintenance/workspaces.md). Keep domains unchanged.
The code prepares hosting; it does not create the project or publish a deployment.

## Official publication retention

The relay operator owns additions and removal. Before adding a share ID, verify ownership using
the publication command's dry-run with the existing private credentials, verify the approved
payload/hash, and review the exact ID in a relay PR. Deploy it before the ordinary expiry window
ends. Never accept an ID from a public request or automatically copy all catalogue entries into
this allow-list. The relay configuration deliberately contains public IDs, not write tokens.

To withdraw a publication, remove its catalogue entry and use the existing authorised share DELETE
with its write token. Retention does not defeat deletion, preserve Gaps reports beyond their own
retention, or recreate deleted bytes. Remove the ID from the relay policy in the same withdrawal;
removing only the policy restores ordinary age-based expiry and can make an old share immediately
unreadable. Removing only a catalogue entry does not withdraw the underlying publication.

After deployment, check all listed payload/manifest reads and compare the publication hashes.
Monitor the existing daily maintenance result and investigate failed reads; no renewal job is
required. If an expired share's objects still exist, deploying the reviewed allow-list restores
availability without changing its URL or bytes. If cleanup has already removed its ownership or
payload, the allow-list cannot recover it: stop, recover from the approved artefact and private
ownership records through an operator-reviewed recovery, and verify the subscriber identity impact
before publishing. Do not mint a replacement and claim the old link was repaired.
