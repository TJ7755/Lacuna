# Lacuna vs Quizlet

Public comparison at `/compare/quizlet/`, promoted from the selected A design.
The prototype branch preserves the discarded alternatives; public builds have no
variant switcher or prototype keyboard shortcuts.

`bun run dev` serves the interactive page. `bun run build` also renders its React
content into `dist/compare/quizlet/index.html`; the browser hydrates the same tree.
The separate entry does not run app initialisation, seed a database or register a
service worker. Links into the study app use its existing root hash routes.

The hero uses the real FSRS model with illustrative review histories. It predicts
card recall, not exam marks. Native flashcard controls and the import preview use
in-memory example material; answers and teacher-sharing toggles save nothing.
See `comparison-research.md` for claim evidence and `captures/README.md` for the
native 2880 × 1920 product captures.

Metadata, canonical URL and social descriptions are in `compare/quizlet/index.html`.
`public/sitemap.xml` lists public canonical pages and `public/robots.txt` advertises
it. Vercel redirects alternate comparison URLs to the trailing-slash canonical.
The PWA excludes comparison navigation from its app-shell fallback, and discovers
the app's own script and stylesheet closure from the build graph.

Validation: `bun run test -- src/pages/quizlet src/pwaConfig.test.ts`, then
`bun run build:assets && node --test scripts/public-pages.test.mjs`. Browser checks
live in `tests/e2e/quizlet-comparison.spec.ts`; the existing offline reload test
covers the app shell after the multi-page build change.
