# 2. Technology stack

- **Build / framework:** Vite 8 + React 19 + TypeScript 7 (strict). SWC React plugin.
- **Styling:** Tailwind CSS v4 (class-based dark mode via `@custom-variant dark`), CSS custom
  properties for the palette, surfaced to Tailwind through `@theme inline`.
- **Routing:** React Router v7, **hash** history (`createHashRouter`) so the app deploys as
  plain static files with no server rewrites.
- **Persistence:** Dexie (IndexedDB) with `dexie-react-hooks` (`useLiveQuery`) for reactive
  reads.
- **Scheduling maths:** the official `ts-fsrs` package (FSRS-6). No hand-rolled memory maths.
- **Parameter training:** `@open-spaced-repetition/binding` (fsrs-rs via WASM in a Web Worker)
  for fitting FSRS weights to review history.
- **Motion:** the `motion` library (`motion/react`).
- **Markdown / maths / code:** `react-markdown` + `remark-gfm` + `remark-math` +
  `rehype-katex` + `rehype-highlight` + `rehype-raw`. KaTeX and highlight.js styles imported
  globally; the restricted expression parser uses the number-only `mathjs/number` entry point.
- **Charts:** Recharts.
- **Fonts:** locally bundled Instrument Sans (body and headings), Fraunces (brand),
  JetBrains Mono (code and the timer/tabular figures). `webBootstrap.ts` adds hosted
  Fraunces and JetBrains Mono stylesheets on HTTP(S).
- **Testing:** Vitest 5 with `fake-indexeddb` for the data and FSRS layers, `@testing-library/react`
  and `happy-dom` for UI component and hook tests. `test:coverage` retains the critical-domain
  gate; `test:coverage:recovery` separately measures persistence, sync merge, quota warnings,
  backups, portability and assets with explicit per-file floors rather than a global average. Both
  coverage gates run in pull-request CI and exact-release verification. Exact-release verification
  also requires the relay typecheck, lint and tests and the standalone AI MCP typecheck, lint, tests
  and build before native packaging starts. CI uses Node.js 24 and also builds and tests the
  isolated handwriting prototype before the aggregate test check can pass.
- **Security checks:** Pull requests and pushes to `master`/`main` run frozen Bun installs and
  high-severity-or-worse audits for the root app, relay and handwriting tool. A weekly scheduled
  workflow also runs CodeQL v4 for JavaScript/TypeScript and GitHub Actions.

Scripts: `dev`/`start` (Vite), `build` (`bun run typecheck && vite build`), `preview`, `typecheck`,
`test`, `test:coverage`, `test:coverage:recovery`, `test:e2e:web`, `test:watch`, and `lint`. The Dashboard is the only eager page;
settings, search, share, analytics, help, course pages, editors, the course conductor and
full-screen routes are lazy-loaded on demand.

### Optional multi-device sync foundation

The P5 sync foundation is optional and does not change the local-first product boundary. The
existing Settings file-based Combine flow remains the manual fallback; the transport seam in
`src/sync/relay.ts` also supports an HTTP relay that stores only opaque bytes. The cycle in
`src/sync/cycle.ts` pulls the encrypted state blob, decrypts and validates it, merges it through
the existing `manualMerge` replace-import path, then pushes only when the merged state changed.
A forced restore point is taken before every peer apply, a stale relay generation is retried once,
and overlapping cycles share one in-flight promise.

P6 adds the Settings Device sync section. First-device setup mints a channel, generates a channel
key, wraps the key and write token in a recovery keybag and pushes the first state. Other devices
join either by scanning an explicit QR capability (with a copyable `LACUNA-SYNC-1:…` link alongside
it) or by entering the relay URL, channel id and recovery passphrase. The QR carries the relay
origin, channel id, write token and channel key; the mint secret is never persisted or included.
Recovery passphrases must contain at least 16 characters. The default relay
(`https://lacuna-relay.vercel.app`) mints without a mint secret (rate-limited 10/hour/IP, 429);
a private relay still requires its `RELAY_MINT_SECRET` behind the Advanced disclosure. Settings
exposes last successful sync, encrypted/plaintext snapshot sizes, the last error, a deliberate Sync
now action, local unpairing and a separately confirmed channel purge. The dashboard shows a
`Synced … · Open sync` pill polling the same state.

P7 makes sync automatic without re-asking the passphrase. `src/sync/triggers.ts`
(`installSyncTriggers` from `src/App.tsx`) debounces and single-flights a pull on window focus /
visibility to visible and a push after a study session ends (`lacuna:study-session-end` from
`src/pages/LearnMode.tsx`). Pairing, joining and every successful passphrase unlock also persist
the unwrapped credentials as `SyncState.remembered`; the triggers restore that copy at install, so
sync works across page reloads without the passphrase. The Settings Lock action clears only the
remembered copy — the wrapped recovery keybag stays for pairing fresh devices — returning the
device to the locked behaviour until the passphrase is used again. The study database itself is
plaintext on device, so remembering the key is the convenience default on a trusted personal
device. While remembered credentials exist, an IndexedDB reader can also decrypt newer peer data
and write or purge the relay channel. Lock removes that capability copy; the remaining wrapped
keybag protects the channel key and write token from an IndexedDB reader without the passphrase.

The relay's opaque ETag is a compare-and-swap generation, not a freshness clock. No phase claims
rollback protection against replay of an older valid ciphertext. Outgoing encrypted state is gated
below the measured platform ceiling at 4.4 MB (nominal Vercel limit 4.5 MB, measured failure at
4.49 MB); failures record the transport and plaintext sizes and name the contributing courses in
`syncState`. The real two- then three-device P9 pass against the live relay was completed on
28 August 2026; no sync implementation or verification phase remains outstanding. The web UI still
remains usable without a relay or network.


[Specification index](../SPEC.md)
