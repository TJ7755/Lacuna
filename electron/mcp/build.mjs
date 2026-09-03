// Bundles the data-owning bridge and disposable stdio companion into runnable ESM files.
//
// Why esbuild rather than the plain `tsc` used for main.ts/preload.ts: the MCP entry points
// share transport-neutral contract and bridge modules written with the renderer's
// extensionless import style. esbuild resolves those imports like Vite and emits runnable
// ESM without forcing NodeNext suffixes through shared source files. The contract registry
// must remain handler-free: electron/mcp/server.ts and companion.ts register schemas but
// never bundle renderer-only database or scheduling code.
//
// `packages: 'external'` bundles every local relative import (our own TS graph) while
// leaving npm-package imports (electron, electron-log, zod, the MCP SDK, ...) as
// ordinary `require`/`import` calls resolved from node_modules at runtime, same as
// main.ts/preload.ts already rely on. Type-checking this graph is `tsc -p
// electron/tsconfig.mcp.json --noEmit` (wired into `bun run typecheck`); esbuild here only
// transpiles and bundles, it does not type-check.

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: {
    server: path.join(__dirname, 'server.ts'),
    companion: path.join(__dirname, 'companion.ts'),
    aiCompanion: path.join(__dirname, 'aiCompanion.ts'),
    aiCompanionEntry: path.join(__dirname, 'aiCompanionEntry.ts'),
  },
  outdir: path.join(__dirname, '..', 'dist-electron', 'mcp'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
