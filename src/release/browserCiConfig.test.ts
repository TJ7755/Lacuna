import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const root = resolve(import.meta.dirname, '../..');

it('serves only the isolated build, refuses port reuse and separates reports', () => {
  const directory = resolve(tmpdir(), "lacuna browser's evidence");
  const result = spawnSync(
    'bun',
    [
      '-e',
      'const { default: config } = await import(process.argv[1]); process.stdout.write(JSON.stringify({ webServer: config.webServer, outputDir: config.outputDir, reporter: config.reporter }));',
      resolve(root, 'tests/config/playwright.web.isolated.config.ts'),
    ],
    {
      cwd: root,
      env: { ...process.env, LACUNA_BROWSER_RUN_DIR: directory, PLAYWRIGHT_WEB_PORT: '4317' },
      encoding: 'utf8',
      timeout: 20_000,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  const config = JSON.parse(result.stdout) as {
    webServer: { command: string; reuseExistingServer: boolean; url: string };
    outputDir: string;
    reporter: [string, { outputFile?: string; outputFolder?: string }?][];
  };
  expect(config.webServer.reuseExistingServer).toBe(false);
  expect(config.webServer.url).toBe('http://127.0.0.1:4317');
  expect(config.webServer.command).toBe('bun scripts/check-browser.mjs --preview');
  expect(config.outputDir).toBe(resolve(directory, 'test-results'));
  expect(config.reporter).toContainEqual([
    'json',
    { outputFile: resolve(directory, 'results.json') },
  ]);
});

interface Suite {
  specs?: { file: string; line: number; column: number; title: string }[];
  suites?: Suite[];
  title: string;
}

interface Listing {
  errors: unknown[];
  config: {
    workers: number;
    fullyParallel: boolean;
    filteredProjects: { name: string }[];
  };
  suites: Suite[];
}

function cases(suites: Suite[], ancestors: string[] = []): string[] {
  return suites.flatMap((suite) => [
    ...(suite.specs ?? []).map(
      (spec) =>
        `${spec.file}:${spec.line}:${spec.column}:${[...ancestors, suite.title, spec.title].join(' > ')}`,
    ),
    ...cases(suite.suites ?? [], [...ancestors, suite.title]),
  ]);
}

it('partitions the complete local Chromium suite across the CI shard matrix and one exclusive image case', () => {
  const workflow = parse(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')) as {
    jobs: { 'browser-tests': { strategy: { matrix: { shard: number[] } } } };
  };
  const shardNumbers = workflow.jobs['browser-tests'].strategy.matrix.shard;
  const directory = mkdtempSync(resolve(tmpdir(), 'lacuna-browser-discovery-'));
  // One spec reads the built homepage during discovery. No browser or test body runs here.
  mkdirSync(resolve(directory, 'dist'));
  writeFileSync(resolve(directory, 'dist/index.html'), '');

  function list(config: string, project: string, ...args: string[]): Listing {
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, 'node_modules/@playwright/test/cli.js'),
        'test',
        '-c',
        resolve(root, 'tests/config', config),
        '--list',
        '--reporter=json',
        `--project=${project}`,
        ...args,
      ],
      {
        cwd: directory,
        env: {
          ...process.env,
          CI: 'true',
          PLAYWRIGHT_JSON_OUTPUT_FILE: '',
          PLAYWRIGHT_JSON_OUTPUT_NAME: '',
        },
        encoding: 'utf8',
        timeout: 20_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const listing = JSON.parse(result.stdout) as Listing;
    expect(listing.errors).toEqual([]);
    return listing;
  }

  try {
    const local = list('playwright.web.config.ts', 'chromium');
    const shards = shardNumbers.map((shard) =>
      list(
        'playwright.web.ci.config.ts',
        'chromium-functional',
        `--shard=${shard}/${shardNumbers.length}`,
      ),
    );
    const image = list('playwright.web.ci.config.ts', 'chromium-image-performance', '--workers=1');
    const mobile = list('playwright.web.config.ts', 'webkit-mobile', '--workers=1');
    const functionalCases = shards.flatMap((shard) => cases(shard.suites));
    const imageCases = cases(image.suites);
    const allCiCases = [...functionalCases, ...imageCases];

    expect(cases(local.suites).length).toBeGreaterThan(0);
    expect(allCiCases.sort()).toEqual(cases(local.suites).sort());
    expect(new Set(allCiCases).size).toBe(allCiCases.length);
    expect(imageCases).toHaveLength(1);
    expect(imageCases[0]).toMatch(/^study-image-advance.spec.ts:/);
    expect(functionalCases.every((name) => !name.startsWith('study-image-advance.spec.ts:'))).toBe(
      true,
    );
    for (const shard of shards) {
      expect(shard.config.workers).toBe(2);
      expect(shard.config.fullyParallel).toBe(true);
      expect(cases(shard.suites).length).toBeGreaterThan(0);
    }
    expect(image.config.workers).toBe(1);
    expect(image.config.filteredProjects).toEqual([
      expect.objectContaining({ name: 'chromium-image-performance' }),
    ]);
    const config = spawnSync(
      'bun',
      [
        '-e',
        'const { default: config } = await import(process.argv[1]); process.stdout.write(JSON.stringify(config.projects));',
        resolve(root, 'tests/config/playwright.web.ci.config.ts'),
      ],
      { cwd: root, encoding: 'utf8', timeout: 20_000 },
    );
    expect(config.status, config.stderr).toBe(0);
    const projects = JSON.parse(config.stdout) as {
      name: string;
      workers?: number;
      fullyParallel?: boolean;
    }[];
    expect(projects.find((project) => project.name === 'chromium-image-performance')).toMatchObject(
      {
        workers: 1,
        fullyParallel: false,
      },
    );
    expect(cases(mobile.suites)).toHaveLength(3);
    expect(cases(mobile.suites).every((name) => name.startsWith('mobile-pwa-smoke.spec.ts:'))).toBe(
      true,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
