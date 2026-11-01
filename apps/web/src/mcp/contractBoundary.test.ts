import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { build, type Metafile } from 'esbuild';
import { z } from 'zod';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import {
  createCourseAssessmentContract,
  updateCourseAssessmentContract,
} from './contracts/content';
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
  'apps/desktop/mcp/server.ts',
  'apps/desktop/mcp/dataBridge.ts',
  'apps/desktop/mcp/companionBroker.ts',
  'apps/desktop/mcp/companion.ts',
  'apps/desktop/mcp/aiCompanion.ts',
  'apps/desktop/mcp/aiCompanionEntry.ts',
] as const;
// The Concept update description permits independent agent review. Existing inputs,
// tool names, permission scopes and the breaking-change version remain unchanged.
const REVIEWED_TOOL_SURFACE = {
  version: 3,
  toolCount: 64,
  sha256: 'ed175d47a7421780693d78b7bdcf0f3cb79370b24a4c97ab2ee4ad095025767f',
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
  it('preserves the reviewed versioned wire surface', () => {
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
    }).toEqual(REVIEWED_TOOL_SURFACE);
  });

  it.each([
    ['prefix with null anchor', { coverageMode: 'prefix', afterLessonId: null }, true, true],
    [
      'prefix with lesson anchor',
      { coverageMode: 'prefix', afterLessonId: 'lesson-1' },
      true,
      true,
    ],
    ['custom coverage', { coverageMode: 'custom', lessonIds: ['lesson-1'] }, true, true],
    ['missing coverage', {}, false, true],
    ['missing custom lessons', { coverageMode: 'custom' }, false, false],
    ['empty custom lessons', { coverageMode: 'custom', lessonIds: [] }, false, false],
    [
      'paper coverage',
      { coverageMode: 'specification', specificationPaperId: 'paper-1' },
      true,
      true,
    ],
    [
      'explicit points',
      { coverageMode: 'specification', specificationPointIds: ['science:cells'] },
      true,
      true,
    ],
    ['missing specification selector', { coverageMode: 'specification' }, false, false],
    [
      'both specification selectors',
      {
        coverageMode: 'specification',
        specificationPaperId: 'paper-1',
        specificationPointIds: ['science:cells'],
      },
      false,
      false,
    ],
    [
      'empty point selection',
      { coverageMode: 'specification', specificationPointIds: [] },
      false,
      false,
    ],
    [
      'unqualified point',
      { coverageMode: 'specification', specificationPointIds: ['cells'] },
      false,
      false,
    ],
    [
      'duplicate points',
      { coverageMode: 'specification', specificationPointIds: ['science:cells', 'science:cells'] },
      false,
      false,
    ],
    [
      'paper with lesson selection',
      { coverageMode: 'specification', specificationPaperId: 'paper-1', lessonIds: ['lesson-1'] },
      false,
      false,
    ],
    [
      'paper selector without specification mode',
      { coverageMode: 'prefix', specificationPaperId: 'paper-1' },
      false,
      false,
    ],
  ])(
    'keeps emitted assessment validation aligned for %s',
    (_label, fields, createAccepted, updateAccepted) => {
      for (const [schema, payload, accepted] of [
        [
          createCourseAssessmentContract.inputSchema,
          {
            courseId: 'course-1',
            name: 'Checkpoint',
            examDate: 1_800_000_000_000,
            afterLessonId: null,
            ...fields,
          },
          createAccepted,
        ],
        [
          updateCourseAssessmentContract.inputSchema,
          { assessmentId: 'assessment-1', ...fields },
          updateAccepted,
        ],
      ] as const) {
        // Exercise the SDK's actual draft-2020-12 validator, not merely Zod refinements.
        const emitted = z.toJSONSchema(schema) as unknown as Parameters<
          AjvJsonSchemaValidator['getValidator']
        >[0];
        const validate = new AjvJsonSchemaValidator().getValidator(emitted);
        expect(schema.safeParse(payload).success).toBe(accepted);
        expect(validate(payload).valid).toBe(accepted);
      }
    },
  );

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

  it('preserves data and AI dependency closures in the combined code-split build', async () => {
    const metafile = (
      await build({
        entryPoints: ['server', 'companion', 'aiCompanion', 'aiCompanionEntry'].map((name) =>
          path.join(PROJECT_ROOT, `apps/desktop/mcp/${name}.ts`),
        ),
        outdir: path.join(PROJECT_ROOT, '.mcp-closure-probe'),
        bundle: true,
        splitting: true,
        platform: 'node',
        format: 'esm',
        target: 'es2022',
        packages: 'external',
        write: false,
        metafile: true,
        logLevel: 'silent',
      })
    ).metafile;
    const outputs = new Map(
      Object.entries(metafile.outputs).map(([file, output]) => [path.resolve(file), output]),
    );
    for (const [file, output] of outputs) {
      if (output.entryPoint || !file.endsWith('.js')) continue;
      expect(
        output.imports.length > 0 ||
          Object.values(output.inputs).some((input) => input.bytesInOutput > 0),
        `Shared chunk has no implementation or imports: ${file}`,
      ).toBe(true);
    }
    for (const name of ['server', 'companion', 'aiCompanion', 'aiCompanionEntry']) {
      const entry = [...outputs].find(
        ([, output]) =>
          output.entryPoint && normalise(output.entryPoint) === `apps/desktop/mcp/${name}.ts`,
      );
      if (!entry) throw new Error(`Missing build entry: ${name}`);
      const inputs = new Set<string>();
      const visited = new Set<string>();
      function visit(file: string): void {
        if (visited.has(file)) return;
        visited.add(file);
        const output = outputs.get(file);
        if (!output) throw new Error(`Missing shared build output: ${file}`);
        for (const [input, contribution] of Object.entries(output.inputs)) {
          if (contribution.bytesInOutput > 0) inputs.add(normalise(input));
        }
        for (const dependency of output.imports) {
          if (!dependency.external) visit(path.resolve(dependency.path));
        }
      }
      visit(entry[0]);
      expect(inputs.has('src/ai/companionErrors.ts'), name).toBe(name.startsWith('ai'));
      expect(
        [...inputs].filter((input) =>
          FORBIDDEN_SOURCE_ROOTS.some((root) => input.startsWith(root)),
        ),
        name,
      ).toEqual([]);
    }
  });

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
