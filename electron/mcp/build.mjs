// Bundles electron/mcp/server.ts into a single runnable ESM file (Arc 2 Section 2.6,
// Task 9's build wiring).
//
// Why esbuild rather than the plain `tsc` used for main.ts/preload.ts: server.ts pulls in
// the whole src/mcp/registry.ts tool-definition graph (src/db/read.ts, src/db/repository.ts,
// and everything they transitively import), which is written with the same extensionless
// relative-import style as the rest of src/ (resolved by Vite's bundler-style
// moduleResolution — see tsconfig.app.json). Compiling that graph with `tsc`'s NodeNext
// resolution (what main.ts/preload.ts use) would require explicit `.js` extensions on every
// relative import across dozens of unrelated src/ files just to satisfy Node's native ESM
// loader — out of scope for this task and against "do not touch unrelated files". esbuild
// resolves those extensionless imports exactly like Vite already does and inlines them into
// one file with correct, extensioned import specifiers for the packages it leaves external.
//
// `packages: 'external'` bundles every local relative import (our own TS graph) while
// leaving npm-package imports (electron, electron-log, dexie, zod, the MCP SDK, ...) as
// ordinary `require`/`import` calls resolved from node_modules at runtime, same as
// main.ts/preload.ts already rely on. Type-checking this graph is `tsc -p
// electron/tsconfig.mcp.json --noEmit` (wired into `bun run typecheck`); esbuild here only
// transpiles and bundles, it does not type-check.

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(__dirname, 'server.ts')],
  outfile: path.join(__dirname, '..', 'dist-electron', 'mcp', 'server.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
