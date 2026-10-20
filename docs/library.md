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
therefore shows no review or progress status. The current links publish Biology revision 17,
Chemistry revision 12, Physics revision 11 and History revision 11.

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
