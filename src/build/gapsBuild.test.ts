import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';

it('ships a teacher-only graph and assets without a learner runtime or PWA', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lacuna-gaps-'));
  const modules: string[] = [];
  try {
    const configFile = existsSync('vite.gaps.config.ts') ? 'vite.gaps.config.ts' : 'vite.config.ts';
    // A separate process keeps Vite's prerender React instance out of the test renderer.
    execFileSync(
      'bun',
      [
        '--eval',
        `
      import { build } from 'vite';
      import { writeFileSync } from 'node:fs';
      const modules = [];
      await build({
        configFile: ${JSON.stringify(configFile)},
        logLevel: 'error',
        build: { outDir: ${JSON.stringify(directory)}, emptyOutDir: true },
        plugins: [{
          name: 'inspect-gaps-graph',
          generateBundle(_options, bundle) {
            for (const item of Object.values(bundle)) {
              if (item.type === 'chunk') modules.push(...Object.keys(item.modules));
            }
          },
        }],
      });
      writeFileSync(${JSON.stringify(join(directory, 'graph.json'))}, JSON.stringify(modules));
    `,
      ],
      { cwd: resolve('.'), stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } },
    );
    modules.push(
      ...(JSON.parse(await readFile(join(directory, 'graph.json'), 'utf8')) as string[]),
    );
    const localModules = modules
      .map((id) => relative(resolve('.'), id.split('?')[0]).replaceAll('\\', '/'))
      .filter((id) => id.startsWith('src/'));
    expect(localModules).toContain('src/teacher/main.tsx');
    expect(
      localModules.filter(
        (id) =>
          ![
            'src/teacher/main.tsx',
            'src/teacher/index.css',
            'src/teacher/TeacherHomeView.tsx',
            'src/state/ThemeContext.tsx',
            'src/components/course/coursePageLayout.ts',
            'src/components/ui/SectionCard.tsx',
            'src/components/ui/buttonStyles.ts',
            'src/components/ui/cn.ts',
          ].includes(id),
      ),
    ).toEqual([]);
    expect(modules.join('\n')).not.toMatch(
      /node_modules\/(?:dexie|motion|react-router|ai|ts-fsrs)\//,
    );
    const files = (await readdir(directory, { recursive: true })).sort();
    expect(await readFile(join(directory, 'sw.js'), 'utf8')).toBe(
      await readFile('gaps/sw.js', 'utf8'),
    );
    expect(files).not.toContain('manifest.json');
    expect(
      files.filter((file) => /(?:workbox|precache|worker|\.wasm$|compare\/)/i.test(file)),
    ).toEqual([]);
    expect(files.filter((file) => /\.(?:js|html)$/.test(file))).toEqual([
      expect.stringMatching(/^assets\/index-[\w-]+\.js$/),
      'index.html',
      'sw.js',
    ]);
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    expect(html).toContain('<title>Gaps · Lacuna</title>');
    expect(html).not.toMatch(/manifest|src\/main\.tsx|simpleanalytics/i);
    const scripts = await Promise.all(
      files.filter((file) => file.endsWith('.js')).map((file) => readFile(join(directory, file))),
    );
    expect(scripts.reduce((size, script) => size + gzipSync(script).byteLength, 0)).toBeLessThan(
      80_000,
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
  const config = JSON.parse(await readFile('gaps/vercel.json', 'utf8')) as {
    installCommand: string;
    buildCommand: string;
    outputDirectory: string;
    rewrites?: unknown;
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  expect(config.installCommand).toBe('cd .. && bunx bun@1.4.3 install --frozen-lockfile');
  expect(config.buildCommand).toBe('cd .. && bunx bun@1.4.3 run build:gaps');
  expect(config.outputDirectory).toBe('dist');
  expect(config.rewrites).toBeUndefined();
  expect(config.headers.find((entry) => entry.source === '/sw.js')?.headers).toContainEqual({
    key: 'Cache-Control',
    value: 'no-store',
  });
  const policy = config.headers
    .find((entry) => entry.source === '/(.*)')
    ?.headers.find((header) => header.key === 'Content-Security-Policy')?.value;
  expect(policy).toContain("connect-src 'none'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("worker-src 'none'");
});
