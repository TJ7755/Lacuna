import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { build, type Metafile } from 'esbuild';
import { z } from 'zod';
import { MCP_TOOL_SURFACE_VERSION, TOOL_CONTRACT_REGISTRY } from './contracts/registry';
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
const PACKAGED_MCP_ENTRY_POINTS = [
  'electron/mcp/server.ts',
  'electron/mcp/dataBridge.ts',
  'electron/mcp/companionBroker.ts',
  'electron/mcp/companion.ts',
  'electron/mcp/aiCompanion.ts',
  'electron/mcp/aiCompanionEntry.ts',
] as const;
const PRE_REFACTOR_TOOL_SURFACE = {
  version: 3,
  toolCount: 64,
  sha256: '233b1a80abdda17081c5300208982d852c5b429f0d612cb4e6133a5be3500095',
} as const;

function normalise(filePath: string): string {
  return path
    .relative(PROJECT_ROOT, path.resolve(PROJECT_ROOT, filePath))
    .replaceAll(path.sep, '/');
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
  it('preserves the versioned pre-refactor wire surface', () => {
    const serialisedSurface = JSON.stringify(
      TOOL_CONTRACT_REGISTRY.map(({ name, description, requiredScope, inputSchema }) => ({
        name,
        description,
        requiredScope,
        inputSchema: z.toJSONSchema(inputSchema),
      })),
    );

    expect({
      version: MCP_TOOL_SURFACE_VERSION,
      toolCount: TOOL_CONTRACT_REGISTRY.length,
      sha256: createHash('sha256').update(serialisedSurface).digest('hex'),
    }).toEqual(PRE_REFACTOR_TOOL_SURFACE);
  });

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

  it.each(PACKAGED_MCP_ENTRY_POINTS)(
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
          .map((entry) =>
            entry.path
              .split('/')
              .slice(0, entry.path.startsWith('@') ? 2 : 1)
              .join('/'),
          ),
      );

      expect(rendererSources).toEqual([]);
      expect(
        [...externalPackages].filter((dependency) => RENDERER_ONLY_PACKAGES.includes(dependency)),
      ).toEqual([]);
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
