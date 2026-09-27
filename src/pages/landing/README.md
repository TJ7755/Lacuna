# Homepage prerender

The site root `/` carries build-time landing HTML inside the application shell
document. `bun run build` renders the React landing tree into
`dist/index.html`; a first-visit browser hydrates the same tree.

- `LandingRoot.tsx` is the shared tree for the server render and the client
  hydration. It skips app initialisation: no database, seed or service worker.
- `entry-server.tsx` installs a minimal happy-dom browser shim (the landing
  reads `window` and `localStorage` during render) and renders through the hash
  router starting on `/`, as a crawler sees it.
- `entry-client.tsx` hydrates that markup. Any navigation into an in-app hash
  route boots the full study app; in-page anchors stay put. The hash router
  navigates with `pushState`, which never fires `hashchange`, so the handover
  watches the history methods as well as hash and popstate events. The handover
  records an explicit entry (`src/landingHandover.ts`) so the app's first-run
  redirect honours it instead of bouncing the visitor back to the welcome route.
  Idle time warms the app chunk (modules only; seeding stays with the app
  bootstrap so the database upgrade snapshot order is unchanged).
- `src/main.tsx` hydrates only for unseeded browsers on a hashless web URL.
  Seeded browsers, in-app hashes and the packaged app boot the study app
  directly; crawlers never run the script and keep the static HTML.
- The exam calendar stamps build-time dates into the prerender. Its date labels
  carry `suppressHydrationWarning` for the first client render and recompute
  for today after mount.

Validation: `bun run build:assets && node --test scripts/public-pages.test.mjs`.
Browser checks live in `tests/e2e/landing-prerender.spec.ts`; the existing offline
reload test covers the app shell after this change.
