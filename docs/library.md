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
