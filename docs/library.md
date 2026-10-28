# Course library

Counts are publication snapshots. Refresh them when republishing a course, using the
actual published payload or its matching build report. Omit unknown statistics instead
of inventing them. Publish a course or revision only after its review is complete; the library
therefore shows no review or progress status. The science courses are Higher-tier selections
alongside History revision 15. Native Biology is revision 31, Chemistry revision 22 and
Physics revision 20; the 18 board variants were republished on 24 October 2026 with reviewed
labelled image Cards, image practice and shared corrections. The 24 October update removed authoring
caveats and repeated mark totals while preserving scientific conditions, stable identities and
learner progress. Combined Science AQA 8464 revision 10, Pearson Edexcel 1SC0 revision 4 and OCR
Gateway J250 revision 3 cover Higher tier with shared
Foundation content; full specification coverage is not independently certified. All three Combined
Science payloads exceed 4 MiB and are published compressed (`deflate-raw-v1`). All science share
URLs and counts were filled from verified exact-byte publication records.

Biology 4BI1 revision 31 adds reviewed specification metadata for five enzyme requirements
(2.10–2.14B), linked to 14 Concepts; 508 Concepts remain explicitly unmapped. This pilot subset
does not certify whole-syllabus coverage or readiness. The verified publication retains the
existing share identity and contains 1,465 Cards, 164 notes, 168 practice sets and 1,533 practice
marks. Independent agent acceptance under the content repository’s standing authority replaces
exact-file human approval; frozen `humanApproval` remains null.

AQA GCSE Religious Studies A (8062) revision 12 is also published. It covers Christianity and
Islam beliefs, teachings and practices for Component 1, with Themes A–F included as optional
Component 2 modules for learners to choose. Its snapshot records 115 lessons, 115 notes,
1,218 Cards, 115 practice sets, 1,380 practice marks and one asset. Practice uses short
lesson-level questions in the 1, 1, 4 and 6-mark styles; this is not full-paper or 12-mark
evaluation practice and does not include SPaG marking. It carries no AQA endorsement or
exam-board review claim. The catalogue counts and stable link come from the verified
revision 12 publication record.

These links retain the source files' lineage and entity identities. Earlier library links used
a separate publisher lineage; importing a current link therefore does not migrate an earlier
subscriber's course or learner evidence. Keep old links available until that migration has
been designed and verified. Use the same current link for later revisions.

## Publish a frozen artefact

The command itself grants no publishing authority. The requester explicitly authorised the
24 October wording corrections and republication of all 26 existing courses after saved review
findings, bounded corrections, builds and import/update checks. This is publication authority for
these exact candidates, not approval for arbitrary later changes. Historical draft approval fields
remain unchanged; requester approval is not trusted builder approval.

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

Serialise publishers for each share. The existing protocol writes payload then manifest, with
separate generation/compare-and-swap checks; it is not a two-slot transaction. A failure can leave
a new payload with an old/missing manifest, or an accepted write whose response was lost. Errors
identify the failing phase and do not claim rollback. Stop other publishers, run dry-run with the
same frozen artefact and inspect the plan before retrying. Matching payload bytes are not resent;
only a missing/outdated manifest is repaired. A 412 conflict is never automatically overwritten.
If another publisher advanced the revision, investigate that publication rather than forcing an
older artefact over it. Verification failures may occur after both slots are live: inspect them
before retrying, and do not treat the failed run as publication evidence.

Skipping unchanged bytes does not renew a share. Ordinary share expiry is unchanged; official
publications use the relay retention policy below after deployment. No production relay was used
to validate this command.

## Cambridge alternative codes

Science entries use the single awarding-body label `Cambridge`. Physics `0972` and `0625`
now have separate catalogue entries and distinct publication lineages. The native `physics0972`
ID and stable share URL remain unchanged, but `0625` is no longer its display/search alias.
Do not treat the two downloads as interchangeable subscriber updates, even where teaching is shared.
The 9–1 science entries use the Cambridge IGCSE (9–1) qualification label.

History remains unchanged: `0977` retains `0470` through `alternativeCodes` for display,
search and public-page metadata, with its original ID, URL, revision and counts.

### Official syllabus check

Historical syllabus comparison checked on 20 October 2026 against the following Cambridge
International PDFs.
This comparison does not merge the separately published Physics lineages. Neither the
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

## Science acceptance limits

The final review accepts the exact 22 frozen candidates and their selected-topic summaries.
It does not certify full syllabus coverage, tier filtering, laboratory competence, future exam
entry, board endorsement or every retained paragraph/Card. Grouped coverage ledgers remain
limitations. Originality declarations and targeted checks are not an exhaustive rights audit.
Historical build/import/update checks do not certify later Biology bytes; current matching
reports and static lineage checks were reviewed separately. Timings remain estimates.

The expanded catalogue uses the existing fields, course sheets and public-page generator.
Distinct board lineages remain distinct. Keep the native links stable when updating their
approved revisions and use verified publication records for new links.

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

## Official publication retention

The policy includes the 26 official catalogue publications, including Religious Studies 8062,
Combined Science 1SC0 and J250, and the 19 new science links.
The relay keeps these publications readable while their ownership and payload
objects exist, using the reviewed allow-list in `relay/src/officialPublications.ts`. The public
catalogue does not grant retention, and ordinary shares still expire after 90 days without a write.
No timer, download or unchanged-publication retry renews a share. The additions take effect only
when this relay change is deployed; catalogue deployment alone does not activate retention.

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
