# Import architecture checks

`bun run lint` enforces the boundary in ESLint, then checks value-import cycles across all
source and test modules under `src/`. Both checks reuse the installed TypeScript resolver;
there is no added dependency or lockfile change. The root lint script adds the cycle-check
command so local lint and CI use the same gate.

`architecture/no-domain-ui` rejects resolved imports from `db`, `fsrs`, `sync`, `ai`, `mcp`,
`questions`, `state` and `course` into `pages`, `components` or `teacher`. This includes
explicit type-only imports, re-exports, inline import types, literal dynamic imports and
literal `require` calls. Shared contracts belong in a domain module; the UI can re-export
those contracts for compatibility. Two exact test edges in `eslint.config.js` are permitted:
`lessonPrerequisites.test.ts` exercises merge-review rows and `sessionHistoryRead.test.ts`
exercises analytics projections. There is no general test exemption.

The cycle checker parses `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` and `.cjs` files,
including tests, with TypeScript. It follows resolved local static imports, value re-exports,
side-effect imports, literal dynamic imports (including lazy imports) and literal `require`
calls. Explicit `import type`, `export type` and all-type named imports/exports do not add
edges. Mixed imports retain their value edge. Declaration files, external packages and
non-code assets are excluded. Resolution uses `tsconfig.app.json`, including paths and
extension/index resolution; Vite query/hash suffixes are removed before resolution.
Value-edge resolution skips declarations so companion `.d.ts`, `.d.mts` and `.d.cts`
files cannot hide JavaScript implementations. The UI boundary check still resolves declarations.
Computed module specifiers, implicit type-only usage without a `type` keyword, loader
execution order and external package cycles are outside this syntax-based check. Unresolved
imports remain the typechecker's responsibility.

The checker finds strongly connected components in linear time after parsing/resolution.
Every reported internal edge belongs to a cycle. Each entry in
`import-cycle-exceptions.json` records one exact cyclic edge set, its reason and
[the follow-up issue](https://github.com/TJ7755/Lacuna/issues/765). Six groups pre-date this
rule: generated cards, assessment scheduling, database maintenance, route
prefetching, question banks and question-set drafts. No folder or import kind is blanket
exempted. New or enlarged components fail, and removing/changing an existing component
requires deleting/updating its stale exception. Removing these debts is separate work.

`bun run test -- scripts/importArchitecture.test.ts` runs controlled filesystem fixtures
against the real ESLint configuration and cycle CLI: forbidden boundaries, permitted domain
contracts, DAGs, explicit type-only back edges, value cycles, exact exceptions and stale or
expanded exceptions. `node scripts/check-import-cycles.mjs` runs the graph check alone;
an optional directory argument selects a fixture root.

`relay-contract/no-deep-imports` rejects root-runtime imports into `relay/src/` and deep
imports into `relay/shared/`. The declared insights surface is
`relay/shared/insights/index.ts`; its implementation stays inside the self-contained relay
Vercel project. The rule resolves types, re-exports, literal dynamic imports and `require`
using TypeScript, including extension/index resolution and query/hash suffix removal.
Exact integration-test edges listed in `eslint.config.js` retain in-process relay fixtures;
other imports from those tests are still checked. The old protocol modules only re-export
for existing relay tests. `bun run test -- scripts/relayImports.test.ts` probes the real
configuration.

`app-contract/no-deep-imports` applies the same resolved-import checks to imports from
`electron/mcp/` and `api/` into the app's `src/`, including tests. Electron MCP uses
`src/mcp/contractEntry.ts` for handler-free tool schemas and types,
`src/mcp/companionEntry.ts` for socket messages and client identity types,
the existing `src/ai/protocol.ts` as the public AI protocol interface,
`src/ai/companionErrors.ts` as the public companion error interface, and
`src/mcp/bridgeEntry.ts` for main-process dispatch, grants and connection state.
The API uses only `src/jev/apiEntry.ts`, exposing the JEV request schema. These named
exports preserve the existing implementations; they do not expose renderer handlers or UI.
Keep bridge implementation exports separate from companion contracts so disposable
companions retain their existing dependency closure. Keep AI protocol and companion errors as separate public modules: combining them in a
re-export module adds an error-module load to the data server, and a protocol-only
re-export module still leaves an imported empty shared chunk. `src/mcp/contractBoundary.test.ts` follows the emitted imports of all
four entry points together, including side-effect imports between shared chunks.
Type-only exports remain explicit.
`bun run test -- scripts/appImports.test.ts` probes rejected deep imports and permitted
entry points through the real configuration. `training-contract/no-deep-imports` uses the same resolver to reject imports from `src`,
`server`, `electron` and `api` into `tooling/short-term-memory`, including tests. The single
shipped coefficient asset is `src/fsrs/coefficients/half-life-logistic-v3.json`; runtime code
imports it directly and keeps the existing complete loader validation. Training and evaluation
remain offline. Two exact integration edges retain the historical v1 artefact and shared
Python prediction fixture in the runtime model test; no general test exemption applies.
`bun run test -- scripts/trainingImports.test.ts` probes this rule through the real configuration.
