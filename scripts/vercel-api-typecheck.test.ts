import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('typechecks hosted API entrypoints with their nearest deployment configuration', () => {
  const entrypoints = ['inference', 'session', 'jev'].map((name) =>
    resolve(`apps/ai/api/ai/${name}.ts`),
  );
  const configFile = ts.findConfigFile(entrypoints[0], ts.sys.fileExists);
  expect(configFile).toBeDefined();
  const config = ts.readConfigFile(configFile!, ts.sys.readFile);
  expect(config.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configFile!),
    {
      noEmit: false,
      outDir: resolve('artifacts/vercel-api-typecheck'),
    },
    configFile,
  );
  // Vercel supplies NodeNext/ES2021 defaults before resolving `extends`.
  expect(config.config.compilerOptions).toMatchObject({ module: 'ESNext', target: 'ES2022' });
  expect(parsed.options.moduleResolution).toBe(ts.ModuleResolutionKind.Bundler);
  expect(parsed.options.types).toContain('node');
  expect(parsed.options.noEmitOnError).toBe(true);
  const program = ts.createProgram(entrypoints, parsed.options);
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  expect(
    diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
  ).toEqual([]);
  const emitted: string[] = [];
  const result = program.emit(undefined, (file) => emitted.push(file));
  expect(result.emitSkipped).toBe(false);
  for (const name of ['inference', 'session', 'jev']) {
    expect(emitted).toContain(resolve(`artifacts/vercel-api-typecheck/apps/ai/api/ai/${name}.js`));
  }
}, 30_000);
