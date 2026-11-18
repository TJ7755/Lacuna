import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';

it('ships a teacher-only graph and assets without a learner runtime or PWA', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lacuna-gaps-'));
  const modules: string[] = [];
  type Chunk = {
    fileName: string;
    isEntry: boolean;
    imports: string[];
    dynamicImports: string[];
    modules: string[];
  };
  try {
    // A separate process keeps Vite's prerender React instance out of the test renderer.
    execFileSync(
      'bun',
      [
        '--eval',
        `
      import { build } from 'vite';
      import { writeFileSync } from 'node:fs';
      const modules = [];
      const chunks = [];
      await build({
        configFile: 'apps/gaps/vite.config.ts',
        logLevel: 'error',
        build: { outDir: ${JSON.stringify(directory)}, emptyOutDir: true },
        plugins: [{
          name: 'inspect-gaps-graph',
          generateBundle(_options, bundle) {
            for (const item of Object.values(bundle)) {
              if (item.type === 'chunk') {
                modules.push(...Object.keys(item.modules));
                chunks.push({ fileName: item.fileName, isEntry: item.isEntry, imports: item.imports,
                  dynamicImports: item.dynamicImports, modules: Object.keys(item.modules) });
              }
            }
          },
        }],
      });
      writeFileSync(${JSON.stringify(join(directory, 'graph.json'))}, JSON.stringify(modules));
      writeFileSync(${JSON.stringify(join(directory, 'chunks.json'))}, JSON.stringify(chunks));
    `,
      ],
      { cwd: resolve('.'), stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } },
    );
    modules.push(
      ...(JSON.parse(await readFile(join(directory, 'graph.json'), 'utf8')) as string[]),
    );
    const chunks = JSON.parse(await readFile(join(directory, 'chunks.json'), 'utf8')) as Chunk[];
    const entries = chunks.filter((chunk) => chunk.isEntry);
    expect(entries).toHaveLength(1);
    const eager = new Set<string>();
    function visit(fileName: string) {
      if (eager.has(fileName)) return;
      eager.add(fileName);
      chunks.find((chunk) => chunk.fileName === fileName)?.imports.forEach(visit);
    }
    visit(entries[0].fileName);
    expect(modules.join('\n')).not.toMatch(/node_modules\/(?:motion|react-router|ai|ts-fsrs)\//);
    const files = (await readdir(directory, { recursive: true }))
      .map((file) => file.replaceAll('\\', '/'))
      .sort();
    expect(await readFile(join(directory, 'sw.js'), 'utf8')).toBe(
      await readFile('apps/gaps/sw.js', 'utf8'),
    );
    expect(files).not.toContain('manifest.json');
    expect(
      files.filter((file) => /(?:workbox|precache|worker|\.wasm$|compare\/)/i.test(file)),
    ).toEqual([]);
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    expect(html).toContain('<title>Gaps – Lacuna</title>');
    expect(html).not.toMatch(/manifest|simpleanalytics/i);
    const eagerScripts = await Promise.all(
      [...eager].map((file) => readFile(join(directory, file))),
    );
    expect(
      eagerScripts.reduce((size, script) => size + gzipSync(script).byteLength, 0),
    ).toBeLessThan(80_000);
    const scripts = await Promise.all(
      files.filter((file) => file.endsWith('.js')).map((file) => readFile(join(directory, file))),
    );
    expect(scripts.reduce((size, script) => size + gzipSync(script).byteLength, 0)).toBeLessThan(
      165_000,
    );
    for (const name of ['InstrumentSans', 'SpaceGrotesk', 'JetBrainsMono']) {
      expect(files).toContain(`fonts/${name}-Variable.ttf`);
      expect(files).toContain(`fonts/${name}-OFL.txt`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);

it('keeps the teacher hosting policy separate and makes retirement updates uncacheable', async () => {
  const config = JSON.parse(await readFile('apps/gaps/vercel.json', 'utf8')) as {
    installCommand: string;
    buildCommand: string;
    outputDirectory: string;
    rewrites?: unknown;
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  expect(config.installCommand).toBe(
    'cd ../.. && node apps/relay/scripts/security-bun.mjs install --frozen-lockfile',
  );
  expect(config.buildCommand).toBe(
    'cd ../.. && node apps/relay/scripts/security-bun.mjs run build:gaps',
  );
  expect(config.outputDirectory).toBe('dist');
  expect(config.rewrites).toBeUndefined();
  expect(config.headers.find((entry) => entry.source === '/sw.js')?.headers).toContainEqual({
    key: 'Cache-Control',
    value: 'no-store',
  });
  const policy = config.headers
    .find((entry) => entry.source === '/(.*)')
    ?.headers.find((header) => header.key === 'Content-Security-Policy')?.value;
  expect(policy).toContain('connect-src https://relay.getlacuna.app;');
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("worker-src 'none'");
});
