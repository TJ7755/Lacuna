import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';

it('builds only the library and its shared presentation, without learner startup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lacuna-library-'));
  try {
    execFileSync(
      'bun',
      [
        '--eval',
        `
      import { build } from 'vite';
      import { writeFileSync } from 'node:fs';
      const modules = [];
      await build({
        configFile: 'vite.library.config.ts', logLevel: 'error',
        build: { outDir: ${JSON.stringify(directory)}, emptyOutDir: true },
        plugins: [{ name: 'inspect-library-graph', generateBundle(_options, bundle) {
          for (const item of Object.values(bundle)) {
            if (item.type === 'chunk') modules.push(...Object.keys(item.modules));
          }
        } }],
      });
      writeFileSync(${JSON.stringify(join(directory, 'graph.json'))}, JSON.stringify(modules));
    `,
      ],
      { cwd: resolve('.'), stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } },
    );
    const modules = JSON.parse(await readFile(join(directory, 'graph.json'), 'utf8')) as string[];
    expect(modules.some((id) => id.endsWith('/src/library/main.tsx'))).toBe(true);
    expect(modules.join('\n')).not.toMatch(
      /src\/(?:db|shareLinks|teacher|insights|sync|ai|fsrs|workers)\/|src\/App\.|node_modules\/(?:dexie|react-router|ts-fsrs|ai)\//,
    );
    const files = await readdir(directory, { recursive: true });
    const scripts = files.filter((file) => file.endsWith('.js')).sort();
    expect(scripts).toEqual([
      expect.stringMatching(/^assets\/index-[\w-]+\.js$/),
      expect.stringMatching(/^assets\/motionFeatures-[\w-]+\.js$/),
    ]);
    expect(files.filter((file) => /(?:worker|manifest|\.wasm$|\.lacuna$)/i.test(file))).toEqual([]);
    expect(await readFile(join(directory, 'index.html'), 'utf8')).toContain(
      '<title>Library · Lacuna</title>',
    );
    const scriptBytes = await Promise.all(
      scripts.map(async (file) => gzipSync(await readFile(join(directory, file))).byteLength),
    );
    expect(scriptBytes.reduce((total, bytes) => total + bytes, 0)).toBeLessThan(125_000);
    for (const name of ['InstrumentSans', 'SpaceGrotesk', 'JetBrainsMono']) {
      expect(files).toContain(`fonts/${name}-Variable.ttf`);
      expect(files).toContain(`fonts/${name}-OFL.txt`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);

it('hosts the static library separately with no network or worker capability', async () => {
  const config = JSON.parse(await readFile('library/vercel.json', 'utf8'));
  expect(config.buildCommand).toBe('cd .. && bunx bun@1.4.3 run build:library');
  expect(config.outputDirectory).toBe('dist');
  expect(config.rewrites).toBeUndefined();
  const policy = config.headers
    .find((entry: { source: string }) => entry.source === '/(.*)')
    .headers.find((header: { key: string }) => header.key === 'Content-Security-Policy').value;
  expect(policy).toContain("connect-src 'none'");
  expect(policy).toContain("worker-src 'none'");
  expect(policy).toContain("frame-ancestors 'none'");
});
