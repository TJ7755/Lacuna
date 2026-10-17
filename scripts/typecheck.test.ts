import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  packageManager: string;
  scripts: Record<string, string>;
};

describe('web typechecking', () => {
  it('checks each configured project and rejects the same errors as native TypeScript', () => {
    expect(manifest.scripts['typecheck:web']).toBe('bun check -b');
    const directory = mkdtempSync(join(tmpdir(), 'lacuna-typecheck-'));
    const write = (file: string, content: string) => {
      mkdirSync(dirname(join(directory, file)), { recursive: true });
      writeFileSync(join(directory, file), content);
    };
    try {
      write('tsconfig.json', readFileSync(join(root, 'tsconfig.json'), 'utf8'));
      for (const name of ['app', 'node', 'release-tooling']) {
        const config = JSON.parse(readFileSync(join(root, `tsconfig.${name}.json`), 'utf8')) as {
          compilerOptions: { types?: string[] };
        };
        // The fixture has no imports; retain the real options and include patterns.
        config.compilerOptions.types = [];
        write(`tsconfig.${name}.json`, JSON.stringify(config));
      }
      const sources = ['src/probe.ts', 'vite.config.ts', 'tests/e2e/probe.ts'];
      for (const source of sources) write(source, 'export const probe: number = "invalid";\n');
      write('outside.ts', 'export const excluded: number = "invalid";\n');
      const before = readdirSync(directory, { recursive: true }).sort();
      const check = () =>
        spawnSync(
          'bun',
          [...manifest.scripts['typecheck:web'].split(' ').slice(1), '--no-pretty'],
          {
            cwd: directory,
            encoding: 'utf8',
            timeout: 20_000,
          },
        );
      const invalid = check();
      expect(invalid.error).toBeUndefined();
      expect(invalid.status).toBe(1);
      const diagnostics = (output: string) =>
        output
          .split(/\r?\n/)
          .filter((line) => line.includes('error TS'))
          .sort();
      expect(diagnostics(invalid.stdout)).toHaveLength(3);
      for (const source of sources) {
        expect(invalid.stdout.replaceAll('\\', '/')).toContain(`${source}(1,14): error TS2322`);
      }
      expect(readdirSync(directory, { recursive: true }).sort()).toEqual(before);
      const native = spawnSync(
        process.execPath,
        [
          join(root, 'node_modules/@typescript/native/bin/tsc'),
          '-b',
          '--noEmit',
          '--pretty',
          'false',
        ],
        { cwd: directory, encoding: 'utf8', timeout: 20_000 },
      );
      expect(native.error).toBeUndefined();
      expect(native.status).toBe(1);
      expect(diagnostics(invalid.stdout)).toEqual(diagnostics(native.stdout));
      for (const source of sources) write(source, 'export const probe: number = 1;\n');
      const valid = check();
      expect(valid.error).toBeUndefined();
      expect(valid.status).toBe(0);
      expect(diagnostics(valid.stdout)).toEqual([]);
      expect(readdirSync(directory, { recursive: true }).some((file) => /\.jsx?$/.test(file))).toBe(
        false,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it('pins the same supported Bun release for development and every workflow', () => {
    expect(manifest.packageManager).toBe('bun@1.4.3');
    const handwriting = JSON.parse(
      readFileSync(join(root, 'tooling/handwriting-maths/package.json'), 'utf8'),
    ) as { packageManager: string };
    expect(handwriting.packageManager).toBe(manifest.packageManager);
    const version = manifest.packageManager.slice('bun@'.length);
    for (const file of readdirSync(join(root, '.github/workflows'))) {
      const workflow = readFileSync(join(root, '.github/workflows', file), 'utf8');
      const versions = [...workflow.matchAll(/bun-version:\s*([^\r\n]+)/g)].map(
        (match) => match[1],
      );
      for (const pinned of versions) expect(pinned, file).toBe(version);
    }
  });
});
