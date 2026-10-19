# Course library

The library is a separate static entry at `library.getlacuna.app`. It displays course
metadata and opens the existing `getlacuna.app/#/s/<code>` share page. It does not
import courses, fetch course payloads, open the learner database or register a worker.
Lacuna handles course imports and subsequent publisher updates on its existing origin.

## Add or update a course

Edit [catalogue.ts](../src/library/catalogue.ts). Each entry has a subject, qualification,
code, short summary, topic preview, review status, content counts and an existing Lacuna share URL. Use `null` for an
unpublished course; its preview remains available with an unavailable action. The URL
boundary accepts only canonical HTTPS links on `getlacuna.app` using the share route.
Do not add private teaching files or owner credentials to this public catalogue.

Counts are publication snapshots. Refresh them when republishing a course, using the
actual published payload or its matching build report. Omit unknown statistics instead
of inventing them. Mark a course reviewed only when review covers that published version;
syllabus authorship alone does not establish completed review. Current courses have earlier
reviewed terms and later additions awaiting review, so their status is `in-progress`.

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
