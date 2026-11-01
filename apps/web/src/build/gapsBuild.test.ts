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
  type Chunk = {
    fileName: string;
    isEntry: boolean;
    imports: string[];
    dynamicImports: string[];
    modules: string[];
  };
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
      const chunks = [];
      await build({
        configFile: ${JSON.stringify(configFile)},
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
    const eagerModules = chunks
      .filter((chunk) => eager.has(chunk.fileName))
      .flatMap((chunk) => chunk.modules);
    expect(eagerModules.join('\n')).not.toMatch(
      /node_modules\/dexie\/|apps\/web\/src\/insights\/|apps\/web\/src\/teacher\/TeacherKeySetup/,
    );
    const localModules = modules
      .map((id) => relative(resolve('.'), id.split('?')[0]).replaceAll('\\', '/'))
      .filter((id) => id.startsWith('apps/web/src/') || id.startsWith('packages/'))
      .map((id) => id.replace(/^apps\/web\//, ''));
    expect(localModules).toContain('src/teacher/main.tsx');
    expect(
      localModules.filter(
        (id) =>
          ![
            'src/teacher/main.tsx',
            'packages/protocol/src/insights/insightsDay.ts',
            'packages/protocol/src/insights/insightsProtocol.ts',
            'src/teacher/index.css',
            'src/teacher/gaps.css',
            'src/teacher/gapsUi.tsx',
            'src/teacher/GapsLoadingBoundary.tsx',
            'src/teacher/GapsSidebar.tsx',
            'src/teacher/classInsights.ts',
            'src/teacher/demoClass.ts',
            'src/teacher/StandaloneTeacherHome.tsx',
            'src/teacher/classSessions.ts',
            'src/teacher/TeacherKeySetup.tsx',
            'src/teacher/TeacherCourses.tsx',
            'src/teacher/CreateGapsClass.tsx',
            'src/teacher/recoveryCode.ts',
            'src/teacher/classRecoveryFile.ts',
            'src/teacher/TeacherClassReports.tsx',
            'src/teacher/ClassAccess.tsx',
            'src/teacher/ClassEvidence.tsx',
            'src/teacher/ClassInvite.tsx',
            'src/teacher/ClassPupils.tsx',
            'src/teacher/ClassResults.tsx',
            'src/teacher/ClassSettings.tsx',
            'src/teacher/readReports.ts',
            'src/teacher/connectionFile.ts',
            'src/teacher/connectionStore.ts',
            'src/teacher/rememberedClass.ts',
            'src/components/ui/Field.tsx',
            'src/insights/envelope.ts',
            'src/insights/recipient.ts',
            'src/insights/classKey.ts',
            'src/insights/classCode.ts',
            'src/insights/evidence.ts',
            'src/insights/mailbox.ts',
            'src/insights/ownerStore.ts',
            'src/insights/recoveryFile.ts',
            'src/sync/crypto.ts',
            'src/sync/relay.ts',
            'src/sync/pairingConfig.ts',
            'src/shareLinks/client.ts',
            'src/shareLinks/payloadCodec.ts',
            'src/state/ThemeContext.tsx',
            'src/components/course/coursePageLayout.ts',
            'src/components/ui/SectionCard.tsx',
            'src/components/ui/buttonStyles.ts',
            'src/components/ui/cn.ts',
            'src/components/ui/icons.tsx',
            'src/components/ui/StudyDrawing.tsx',
            'src/hooks/useFocusTrap.ts',
          ].includes(id),
      ),
    ).toEqual([]);
    expect(modules.join('\n')).not.toMatch(/node_modules\/(?:motion|react-router|ai|ts-fsrs)\//);
    const files = (await readdir(directory, { recursive: true })).sort();
    expect(await readFile(join(directory, 'sw.js'), 'utf8')).toBe(
      await readFile('apps/gaps/sw.js', 'utf8'),
    );
    expect(files).not.toContain('manifest.json');
    expect(
      files.filter((file) => /(?:workbox|precache|worker|\.wasm$|compare\/)/i.test(file)),
    ).toEqual([]);
    expect(files.filter((file) => /\.(?:js|html)$/.test(file))).toEqual([
      expect.stringMatching(/^assets\/StudyDrawing-[\w-]+\.js$/),
      expect.stringMatching(/^assets\/TeacherClassReports-[\w-]+\.js$/),
      expect.stringMatching(/^assets\/TeacherCourses-[\w-]+\.js$/),
      expect.stringMatching(/^assets\/TeacherKeySetup-[\w-]+\.js$/),
      expect.stringMatching(/^assets\/classRecoveryFile-[\w-]+\.js$/),
      expect.stringMatching(/^assets\/connectionStore-[\w-]+\.js$/),
      expect.stringMatching(/^assets\/index-[\w-]+\.js$/),
      expect.stringMatching(/^assets\/ownerStore-[\w-]+\.js$/),
      'index.html',
      'sw.js',
    ]);
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    expect(html).toContain('<title>Gaps · Lacuna</title>');
    expect(html).not.toMatch(/manifest|src\/main\.tsx|simpleanalytics/i);
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
