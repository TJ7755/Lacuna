// Bundles the data-owning bridge and disposable stdio companion into runnable ESM files.
//
// Why esbuild rather than the plain `tsc` used for main.ts/preload.ts: the MCP entry points
// share transport-neutral contract and bridge modules written with the renderer's
// extensionless import style. esbuild resolves those imports like Vite and emits runnable
// ESM without forcing NodeNext suffixes through shared source files. The contract registry
// must remain handler-free: electron/mcp/server.ts and companion.ts register schemas but
// never bundle renderer-only database or scheduling code.
//
// Bundle the SDK and schema implementation once across the entry points. Only
// Electron and its logger are supplied by the host; copying complete SDK packages
// into app.asar ships unused transports, declarations and duplicate entry points.
// Type-checking remains separate in electron/tsconfig.mcp.json.

import { build } from 'esbuild';
import path from 'node:path';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outdir = path.join(__dirname, '..', 'dist-electron', 'mcp');
// Content-hashed shared chunks from the previous build must not enter the package.
rmSync(outdir, { recursive: true, force: true });

const result = await build({
  entryPoints: {
    server: path.join(__dirname, 'server.ts'),
    companion: path.join(__dirname, 'companion.ts'),
    aiCompanion: path.join(__dirname, 'aiCompanion.ts'),
    aiCompanionEntry: path.join(__dirname, 'aiCompanionEntry.ts'),
  },
  outdir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  external: ['electron', 'electron-log'],
  splitting: true,
  sourcemap: true,
  metafile: true,
  logLevel: 'info',
});

// Bundling removes node_modules from the distributable, so carry the full licences
// alongside the generated code rather than relying on package-directory copies.
const packageRoots = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const absolute = path.resolve(input).replaceAll('\\', '/');
  const marker = '/node_modules/';
  const index = absolute.lastIndexOf(marker);
  if (index < 0) continue;
  const parts = absolute.slice(index + marker.length).split('/');
  const name = parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/');
  packageRoots.add(absolute.slice(0, index + marker.length) + name);
}
const licences = [...packageRoots].sort().map((directory) => {
  const pkg = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const files = readdirSync(directory).filter((name) =>
    /^(licen[cs]e|copying|notice)([.-].*)?$/i.test(name),
  );
  if (files.length === 0) throw new Error(`Missing bundled dependency licence: ${pkg.name}`);
  return `${pkg.name}@${pkg.version}\n\n${files
    .sort()
    .map((name) => readFileSync(path.join(directory, name), 'utf8'))
    .join('\n')}`;
});
writeFileSync(path.join(outdir, 'THIRD-PARTY-LICENCES.txt'), licences.join('\n\n---\n\n'));
