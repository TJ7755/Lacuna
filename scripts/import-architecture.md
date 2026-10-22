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
Computed module specifiers, implicit type-only usage without a `type` keyword, loader
execution order and external package cycles are outside this syntax-based check. Unresolved
imports remain the typechecker's responsibility.

The checker finds strongly connected components in linear time after parsing/resolution.
Every reported internal edge belongs to a cycle. Each entry in
`import-cycle-exceptions.json` records one exact cyclic edge set, its reason and
[the follow-up issue](https://github.com/TJ7755/Lacuna/issues/765). Seven groups pre-date this
rule: generated cards, assessment scheduling, database maintenance, JEV attempts, route
prefetching, question banks and question-set drafts. No folder or import kind is blanket
exempted. New or enlarged components fail, and removing/changing an existing component
requires deleting/updating its stale exception. Removing these debts is separate work.

`bun run test -- scripts/importArchitecture.test.ts` runs controlled filesystem fixtures
against the real ESLint configuration and cycle CLI: forbidden boundaries, permitted domain
contracts, DAGs, explicit type-only back edges, value cycles, exact exceptions and stale or
expanded exceptions. `node scripts/check-import-cycles.mjs` runs the graph check alone;
an optional directory argument selects a fixture root.
