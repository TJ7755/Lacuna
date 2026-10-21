# Course library

The library is a separate static entry at `library.getlacuna.app`. It displays course
metadata and opens the existing `getlacuna.app/#/s/<code>` share page. It does not
import courses, fetch course payloads, open the learner database or register a worker.
Lacuna handles course imports and subsequent publisher updates on its existing origin.

## Add or update a course

Edit [catalogue.ts](../src/library/catalogue.ts). Each entry has a subject, awarding body,
qualification, code, short summary, topic preview, content counts and an existing Lacuna share
URL. The awarding body filters the library when courses come from more than one. Use `null`
for an unpublished course; its sheet remains available with an unavailable action. The URL
boundary accepts only canonical HTTPS links on `getlacuna.app` using the share route.
Do not add private teaching files or owner credentials to this public catalogue.

Counts are publication snapshots. Refresh them when republishing a course, using the
actual published payload or its matching build report. Omit unknown statistics instead
of inventing them. Publish a course or revision only after its review is complete; the library
therefore shows no review or progress status. The current links publish Biology revision 20,
Chemistry revision 14, Physics revision 13 and History revision 11.

The catalogue also records `author`, `publisher`, `revision` and an optional `revisionDate`
(YYYY-MM-DD) for the published revision. Use Lacuna for authorship and publishing unless a
course has a recorded author or publisher. Derive revision numbers and dates from publication
records; omit unknown fields. The current revision numbers come from the publication record
above; no publication dates are recorded, so dates remain absent. These fields appear on both
the library course sheet and the public course page. They do not imply external review or
awarding-body endorsement.

**Report a mistake** opens a prefilled issue at
`https://github.com/TJ7755/Lacuna/issues/new`. The title and body contain only the course id,
known revision and, if entered, an optional card, note or practice set reference. The reference
is typed by the reporter, not read from their local course. The route never reads or attaches
learner data, scheduling information or study history. The reporter can describe the mistake
and review the public issue on GitHub before submitting it. Local **Flag card** remains a
mark on the learner's own copy and does not contact the publisher.

These links retain the source files' lineage and entity identities. Earlier library links used
a separate publisher lineage; importing a current link therefore does not migrate an earlier
subscriber's course or learner evidence. Keep old links available until that migration has
been designed and verified. Use the same current link for later revisions.

## Publish a frozen artefact

[The publication command](../scripts/library-publish.ts) accepts an existing stable share and an
explicit `.lacuna` course file. It validates through the existing course/media validators, hashes
and uploads the original bytes, then downloads both slots to verify the payload SHA-256 and
manifest before reporting `published`. It never imports, rebuilds, increments revisions, rewrites
identities, mints links or updates the catalogue. Keep source artefacts in the private content
repository. This first slice does not authorise publishing any existing official course; prove the
workflow on a synthetic share in a local/staging relay first.

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

Dry-run validates, checks ownership, reads both slots and reports `sha256`, `currentSha256` and
which slots would change. It writes nothing, including local files. Review that exact frozen
artefact and record its hash in your private approval evidence. For a real run supply that hash;
a missing or mismatched approval hash fails before writing:

```bash
bun scripts/library-publish.ts --artefact "$FROZEN_ARTEFACT" --course-id synthetic \
  --share "$STABLE_SHARE_URL" --credentials "$LACUNA_OWNER_FILE" \
  --approved-sha256 "$APPROVED_SHA256" > "$PUBLICATION_RECORD"
```

The stdout JSON is public-safe: course id, payload format version, frozen revision, SHA-256,
byte size and derived card/note/lesson/Question/media counts. Question set formats also supply
`practiceSets` and `practiceMarks` through the existing marking calculation; older formats omit
those unknown statistics. `operator-approved` records only the operator's assertion for this
exact hash, not independent review or endorsement. Dry-run without an approval hash says
`unreviewed`; approval never transfers to changed bytes. Retain successful records outside the
repository, then manually update catalogue snapshots from the verified publication. A failed
run returns non-zero, writes its error to stderr and emits no success record.

Repeated identical payload and manifest return `skipped` without a write. Higher revisions must
already exist in a separately reviewed frozen file. Reusing a revision for different bytes,
rolling back either slot's revision or changing lineage is refused. The manifest uses the frozen
payload's exported-at timestamp so retries remain deterministic. Identity migration for old live
links remains separate, risk-bearing work; this command cannot repair identity mismatches.

Serialise publishers for each share. The existing protocol writes payload then manifest, with
separate generation/compare-and-swap checks; it is not a two-slot transaction. A failure can leave
a new payload with an old/missing manifest, or an accepted write whose response was lost. Errors
identify the failing phase and do not claim rollback. Stop other publishers, run dry-run with the
same frozen artefact and inspect the plan before retrying. Matching payload bytes are not resent;
only a missing/outdated manifest is repaired. A 412 conflict is never automatically overwritten.
If another publisher advanced the revision, investigate that publication rather than forcing an
older artefact over it. Verification failures may occur after both slots are live: inspect them
before retrying, and do not treat the failed run as publication evidence.

Skipping unchanged bytes does not renew a share. Ordinary share expiry is unchanged; the official
link longevity policy in issue #630 remains separate. No production relay was used to validate
this command.

## Cambridge alternative codes

The catalogue keeps `0972` and `0977` as the primary codes and retains the existing course
IDs and share URLs. `alternativeCodes` supplies `0625` and `0470` for display, text search and
public-page metadata. These are two grading versions of the same subject content, not extra
courses. The qualification label is Cambridge IGCSE because the combined listing serves both
the A*–G and 9–1 scales.

### Official syllabus check

Checked on 20 October 2026 against the following Cambridge International PDFs. Neither the
catalogue nor its course sheet declares exam years; this check is limited to the editions below
and does not establish coverage for later syllabuses or audit every published lesson.

- Physics, exams 2026–28: [0625, version 2](https://www.cambridgeinternational.org/Images/697209-2026-2028-syllabus.pdf)
  and [0972, version 2](https://www.cambridgeinternational.org/Images/697240-2026-2028-syllabus.pdf),
  subject content pp. 12–41. Both state: “Use this syllabus for exams in 2026, 2027 and 2028.”
  Comparing the complete subject-content sections after removing page headers, footers and
  whitespace finds only grading-label differences: maximum Core grade C versus 5, and Extended
  target grades A*–C versus 9–4. Learning objectives, Core/Supplement content and all six topic
  groups match. Cambridge's [0972 overview](https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-physics-9-1-0972/)
  explicitly confirms it is “graded from 9 to 1 but is otherwise the same as Cambridge IGCSE Physics (0625)”.
- History, exams 2024–26: [0470, version 1](https://www.cambridgeinternational.org/Images/649636-2024-2026-syllabus.pdf)
  and [0977, version 2](https://www.cambridgeinternational.org/Images/649638-2024-2026-syllabus.pdf),
  subject content pp. 11–28. Both include “Option B The twentieth century: international relations
  since 1919.” and “Depth study B: Germany, 1918–45”. The complete subject-content text matches
  after removing page headers, footers and whitespace. This comparison, rather than a blanket
  equivalence sentence in these PDFs, establishes the content equivalence.
- History, exams 2027–28: [0470, version 1](https://www.cambridgeinternational.org/Images/721327-2027-2028-syllabus.pdf)
  and [0977, version 1](https://www.cambridgeinternational.org/Images/721357-2027-2028-syllabus.pdf),
  subject content pp. 11–28. Again the paired subject-content text matches. Both say:
  “There are no significant changes which affect teaching.” The changes section on p. 41 repeats this teaching-continuity statement; Paper 2 still uses
  year- and series-specific prescribed topics (p. 30).
  The change in introductory wording and added faculty feedback does not change the subject
  objectives between the two History periods checked.

Both History codes offer Core Option A or B and the same five depth studies: the First World
War; Germany; Russia; the United States; and the Second World War in Europe and the Asia–Pacific.
Lacuna advertises only its listed Option B topics and Germany, 1918–45. The preview does not
list the sixth Option B question on USSR control of Eastern Europe, and does not establish full
Option B coverage. Adding 0470 does not claim all History options, coursework support or full
exam preparation. Paper 2 prescribed topics depend on the exam year and series.

The codes also differ in entry arrangements, not just grades. The PDF covers offer June and
November for all four codes, with an additional March series in India for 0625/0470. The 9–1
versions have administrative-zone restrictions; consult the current Cambridge syllabus pages
before making entries. Do not treat these metadata aliases as interchangeable exam-entry codes.

## Develop and check

```bash
bun run dev:library
bun run build:library
PLAYWRIGHT_WEB_PORT=4347 bun run verify:browser -- --library --project=chromium library-standalone.spec.ts
```

The build check caps all JavaScript together at 125 kB gzipped, including the library entry
and the shared Motion feature chunk. This replaces the previous single-bundle 80 kB budget
to support the app's shared cover expansion and filter motion. The feature chunk loads when
the library mounts; it is included in the cap even though its import is asynchronous. The
complete module graph must still exclude learner startup, storage, synchronisation and AI.

## Hosting

Create a separate Vercel project named `lacuna-library`, connected to this repository.
Set its Root Directory to `library`, production branch to `master`, and enable
**Include source files outside of the Root Directory in the Build Step**. That setting
allows the entry to reuse Lacuna's fonts, styles and React components
([Vercel monorepo guidance](https://vercel.com/docs/monorepos/monorepo-faq#can-i-share-source-files-between-projects-are-shared-packages-supported)).

[library/vercel.json](../library/vercel.json) supplies the install/build commands and
`dist` output directory. Assign `library.getlacuna.app` to that project's Production
environment. Keep the main Lacuna and Gaps projects, domains and build settings unchanged.
The code prepares hosting; it does not create the project or publish a deployment.

## Public course pages

The main site also serves `/courses/` and `/courses/<id>/` from the same catalogue.
The [public-page prerender plugin](../scripts/public-page-prerender.ts) renders the
same React tree used for browser hydration, using one [HTML template](../courses/index.html)
for the index and every course. The built HTML includes course content, canonical metadata
and Course JSON-LD without requiring JavaScript. Public routes stay outside the PWA app-shell
fallback and precache. No course payload or learner database is opened by these pages.

Adding a catalogue entry generates its page automatically. Also update
[sitemap.xml](../public/sitemap.xml) and [llms.txt](../public/llms.txt); catalogue coverage tests
reject missing course URLs. [Public-page tests](../scripts/public-pages.test.mjs) inspect
the built HTML after the main-site build.
