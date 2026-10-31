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
  it('checks configured web projects, rejects invalid sources and emits no JavaScript', () => {
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
});
