# Course library operations

## Publish a frozen artefact

Complete the sol-loop skill’s independent review of the exact frozen candidate and its build/import/update
checks before publishing. Record the accepted SHA-256 separately from historical draft fields.
Source booleans do not authorise publication. Supply that accepted hash to the existing publisher.

Provide the existing share's owner credentials through `LACUNA_RELAY_URL` and
`LACUNA_WRITE_TOKEN`, or through an external JSON file with `relayUrl` and `writeToken`
fields passed as `--credentials "$LACUNA_OWNER_FILE"`. Specify the owning relay explicitly.
Keep this file outside every checkout, restrict access to its owner and inject environment
credentials through your secret manager. Never paste tokens into command arguments, commit them,
include them in review evidence or enable shell tracing. HTTP is accepted only for loopback relays;
remote relays require HTTPS. Keep private response text out of publication evidence.

Run a dry-run with the catalogue course ID and a synthetic stable link.

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

Serialise publishers for each share. After a failed publication, stop other publishers,
repeat the dry-run and inspect both published slots before retrying. Investigate revision
conflicts rather than overwriting another publication.

## Hosting

Create `lacuna-library` and assign `library.getlacuna.app` to its Production environment.
Use the [workspace dashboard procedure](maintenance/workspaces.md). Deploy the main domain before
the Library redirects.

## Main-domain specification-topic pages

Refresh samples with `python3 scripts/extract-topic-samples.py` after catalogue changes.
Retain the publication identity and source revision, and inspect a rendered sample. Keep production
builds independent of mutable share payloads. Preserve published URLs or redirect them permanently.

Publish only original Lacuna flashcards and practice questions. Use specification codes and titles
to identify coverage. Keep specification body text, assessment guidance and past-paper questions
out of public samples.

## Official publication retention

The relay operator owns additions and removal. Before adding a share ID, verify ownership using
the publication command's dry-run with the existing private credentials, verify the approved
payload/hash, and review the exact ID in a relay PR. Deploy it before the ordinary expiry window
ends. Never accept an ID from a public request or automatically copy all catalogue entries into
this allow-list. The relay configuration deliberately contains public IDs, not write tokens.

To withdraw a publication, remove its catalogue entry and use the existing authorised share DELETE
with its write token. Remove the ID from the relay policy in the same withdrawal.

After deployment, check all listed payload/manifest reads and compare the publication hashes.
Monitor daily maintenance and investigate failed reads. For an expired share, verify retained
objects and ownership privately before deploying a reviewed retention-policy correction.
If recovery fails, stop and recover from the approved artefact and private ownership records
through an operator-reviewed recovery. Verify subscriber identity impact before publication.
Do not mint a replacement and claim the old link was repaired.
