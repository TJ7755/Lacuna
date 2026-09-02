import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { build, type Metafile } from 'esbuild';
import { TOOL_CONTRACT_REGISTRY } from './contracts/registry';
import { TOOL_REGISTRY } from './registry';

const PROJECT_ROOT = process.cwd();
const FORBIDDEN_SOURCE_ROOTS = [
  'src/db/',
  'src/fsrs/',
  'src/items/',
  'src/questions/',
  'src/state/',
];
const RENDERER_ONLY_PACKAGES = ['dexie', 'react', 'ts-fsrs'];

function normalise(filePath: string): string {
  return path.relative(PROJECT_ROOT, path.resolve(PROJECT_ROOT, filePath)).replaceAll(path.sep, '/');
}

async function bundleMetafile(entryPoint: string): Promise<Metafile> {
  const result = await build({
    entryPoints: [path.join(PROJECT_ROOT, entryPoint)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2022',
    packages: 'external',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  return result.metafile;
}

describe('Electron MCP contract boundary', () => {
  it('keeps executable tools in exact contract order with identical metadata and schemas', () => {
    expect(TOOL_REGISTRY.map((tool) => tool.name)).toEqual(
      TOOL_CONTRACT_REGISTRY.map((tool) => tool.name),
    );
    for (const [index, tool] of TOOL_REGISTRY.entries()) {
      const contract = TOOL_CONTRACT_REGISTRY[index];
      expect(tool).toMatchObject({
        name: contract.name,
        description: contract.description,
        requiredScope: contract.requiredScope,
      });
      expect(tool.inputSchema).toBe(contract.inputSchema);
    }
  });

  it.each(['electron/mcp/server.ts', 'electron/mcp/companion.ts'])(
    '%s excludes renderer-only source and package dependencies',
    async (entryPoint) => {
      const metafile = await bundleMetafile(entryPoint);
      const inputs = Object.keys(metafile.inputs).map(normalise);
      const rendererSources = inputs.filter((input) =>
        FORBIDDEN_SOURCE_ROOTS.some((root) => input.startsWith(root)),
      );
      const externalPackages = new Set(
        Object.values(metafile.outputs)
          .flatMap((output) => output.imports)
          .filter((entry) => entry.external)
          .map((entry) => entry.path.split('/').slice(0, entry.path.startsWith('@') ? 2 : 1).join('/')),
      );

      expect(rendererSources).toEqual([]);
      expect([...externalPackages].filter((dependency) =>
        RENDERER_ONLY_PACKAGES.includes(dependency),
      )).toEqual([]);
    },
  );

  it('keeps renderer-only packages out of Electron runtime dependencies', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

    for (const dependency of RENDERER_ONLY_PACKAGES) {
      expect(packageJson.dependencies).not.toHaveProperty(dependency);
      expect(packageJson.devDependencies).toHaveProperty(dependency);
    }
  });
});
