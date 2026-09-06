import { chromium, expect as baseExpect } from '@playwright/test';
import { clickToReadable } from './latency';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat, readdir, rm, cp } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { platform, arch, totalmem, cpus } from 'node:os';
import { performance } from 'node:perf_hooks';

const output = resolve(process.env.PERF_OUTPUT ?? 'artifacts/performance/local.json');
const expect = baseExpect.configure({ timeout: 60_000 });
const rates = (process.env.PERF_RATES ?? '1,4,6').split(',').map(Number);
const repetitions = Number(process.env.PERF_REPETITIONS ?? 3);
const burstReviews = Number(process.env.PERF_BURST_REVIEWS ?? 0);
const smoke = process.env.PERF_SMOKE === '1';
const quick = process.env.PERF_MODE === 'quick';
const profileDir = process.env.PERF_PROFILE_DIR ? resolve(process.env.PERF_PROFILE_DIR) : undefined;
const port = Number(process.env.PERF_PORT ?? (profileDir ? 4173 : 0));
const profileSentinel = 'lacuna-heavy-performance-profile-v2-schema27-fixture1';
if (
  !rates.length ||
  rates.some((rate) => !Number.isFinite(rate) || rate < 1) ||
  !Number.isInteger(repetitions) ||
  repetitions < 1 ||
  !Number.isInteger(burstReviews) ||
  burstReviews < 0
) {
  throw new Error(
    'PERF_RATES must contain factors >= 1; PERF_REPETITIONS must be positive; PERF_BURST_REVIEWS must be a non-negative integer.',
  );
}
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error('PERF_PORT must be an integer from 0 to 65535.');
}
const root = resolve('dist');
const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!path.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body =
      pathname === '/__performance_fixture'
        ? '<!doctype html><title>Performance fixture</title>'
        : await readFile(path);
    response
      .writeHead(200, {
        'Content-Type':
          pathname === '/__performance_fixture'
            ? 'text/html'
            : (mime[extname(path)] ?? 'application/octet-stream'),
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Server has no port.');
const origin = `http://127.0.0.1:${address.port}`;
const browser = profileDir ? undefined : await chromium.launch({ headless: true });
let activeRunProfile: string | undefined;
let activeContext: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
const interrupt = () => {
  void activeContext?.close();
  void browser?.close();
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const report: Record<string, unknown> = {
  completed: false,
  measuredAt: new Date().toISOString(),
  label: process.env.PERF_LABEL ?? 'mac-host',
  platform: platform(),
  arch: arch(),
  totalMemoryBytes: totalmem(),
  logicalCpus: cpus().length,
  cpu: cpus()[0]?.model,
  browser: browser?.version(),
  repetitions,
  burstReviews,
  rates,
  smoke,
  mode: quick ? 'quick' : 'full',
  persistentProfile: profileDir ?? null,
  productionIndexBytes: (await stat(resolve(root, 'index.html'))).size,
  timingMethod:
    'Host wall clock: action through asserted visible result and two animation frames; includes Playwright overhead.',
  limitations:
    'Headless Chromium; CPU throttling affects renderer execution, not an entire low-end CPU/GPU/storage system. JavaScript heap is not total application RAM. Linux memory includes OS, browser and runner.',
};
const runs: unknown[] = [];
report.runs = runs;
const expectedCounts = smoke
  ? { courses: 1, lessons: 2, cards: 200, reviews: 4_000 }
  : { courses: 10, lessons: 100, cards: 10_000, reviews: 200_000 };

async function claimProfile(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const marker = resolve(directory, '.lacuna-heavy-profile');
  try {
    const value = (await readFile(marker, 'utf8')).trim();
    if (value !== profileSentinel) throw new Error(`Profile sentinel mismatch: ${directory}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const entries = await readdir(directory);
    if (entries.length > 0) {
      throw new Error(`Refusing unowned non-empty performance profile: ${directory}`);
    }
    await writeFile(marker, `${profileSentinel}\n`, 'utf8');
  }
}

async function prepareBaseProfile(): Promise<void> {
  if (!profileDir) return;
  await claimProfile(profileDir);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1365, height: 900 },
    locale: 'en-GB',
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'log') console.log(message.text());
    });
    await page.goto(`${origin}/__performance_fixture`);
    await page.addScriptTag({ path: 'artifacts/performance/fixture.js' });
    const counts = await page.evaluate(
      async (small) => {
        const fixture = (
          globalThis as unknown as {
            LacunaHeavyFixture: {
              counts(): Promise<unknown>;
              seed(smoke: boolean): Promise<unknown>;
            };
          }
        ).LacunaHeavyFixture;
        const existing = await fixture.counts();
        return JSON.stringify(existing) === JSON.stringify(small.expected)
          ? existing
          : fixture.seed(small.smoke);
      },
      { expected: expectedCounts, smoke },
    );
    if (JSON.stringify(counts) !== JSON.stringify(expectedCounts)) {
      throw new Error(`Unexpected persistent fixture counts: ${JSON.stringify(counts)}`);
    }
  } finally {
    await context.close();
  }
}

async function freshRunProfile(rate: number): Promise<string | undefined> {
  if (!profileDir) return undefined;
  const directory = `${profileDir}.run-${rate}`;
  try {
    const marker = (await readFile(resolve(directory, '.lacuna-heavy-profile'), 'utf8')).trim();
    if (marker !== profileSentinel) throw new Error(`Profile sentinel mismatch: ${directory}`);
    await rm(directory, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      await readdir(directory);
      throw new Error(`Refusing unowned performance profile: ${directory}`);
    } catch (directoryError) {
      if ((directoryError as NodeJS.ErrnoException).code !== 'ENOENT') throw directoryError;
    }
  }
  await cp(profileDir, directory, { recursive: true });
  return directory;
}

async function removeOwnedProfile(directory: string): Promise<void> {
  const marker = (await readFile(resolve(directory, '.lacuna-heavy-profile'), 'utf8')).trim();
  if (marker !== profileSentinel) throw new Error(`Profile sentinel mismatch: ${directory}`);
  await rm(directory, { recursive: true, force: true });
}

async function linuxMemory() {
  if (platform() !== 'linux') return null;
  const mem = await readFile('/proc/meminfo', 'utf8');
  const vm = await readFile('/proc/vmstat', 'utf8');
  const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(mem)?.[1] ?? 0);
  const counter = (key: string) => Number(new RegExp(`^${key} (\\d+)`, 'm').exec(vm)?.[1] ?? 0);
  return {
    availableKiB: kb('MemAvailable'),
    swapUsedKiB: kb('SwapTotal') - kb('SwapFree'),
    majorFaults: counter('pgmajfault'),
    oomKills: counter('oom_kill'),
  };
}
try {
  await prepareBaseProfile();
  for (const rate of rates) {
    const runProfile = await freshRunProfile(rate);
    activeRunProfile = runProfile;
    const context = runProfile
      ? await chromium.launchPersistentContext(runProfile, {
          headless: true,
          viewport: { width: 1365, height: 900 },
          locale: 'en-GB',
          reducedMotion: 'no-preference',
          serviceWorkers: 'block',
        })
      : await browser!.newContext({
          viewport: { width: 1365, height: 900 },
          locale: 'en-GB',
          reducedMotion: 'no-preference',
          serviceWorkers: 'block',
        });
    activeContext = context;
    report.browser = context.browser()?.version();
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'log') console.log(message.text());
    });
    page.setDefaultTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('crash', () => errors.push('Renderer crashed'));
    // No application code is running whilst the real schema is populated.
    await page.goto(`${origin}/__performance_fixture`);
    console.log('Loading fixture bundle');
    await page.addScriptTag({ path: 'artifacts/performance/fixture.js' });
    const fixtureCounts = await page.evaluate(async () => {
      const fixture = (
        globalThis as unknown as {
          LacunaHeavyFixture: {
            counts(): Promise<unknown>;
            seed(smoke: boolean): Promise<unknown>;
          };
        }
      ).LacunaHeavyFixture;
      return fixture.counts();
    });
    const counts =
      JSON.stringify(fixtureCounts) === JSON.stringify(expectedCounts)
        ? fixtureCounts
        : await page.evaluate(async (small) => {
            const fixture = (
              globalThis as unknown as {
                LacunaHeavyFixture: { seed(smoke: boolean): Promise<unknown> };
              }
            ).LacunaHeavyFixture;
            return fixture.seed(small);
          }, smoke);
    console.log(JSON.stringify(counts));
    expect(counts).toEqual(expectedCounts);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await cdp.send('Performance.enable');
    const samples: unknown[] = [];
    const memoryBefore = await linuxMemory();
    const memorySamples: NonNullable<Awaited<ReturnType<typeof linuxMemory>>>[] = [];
    let pendingSample: Promise<void> | undefined;
    const timer = setInterval(() => {
      if (pendingSample) return;
      pendingSample = linuxMemory()
        .then((sample) => {
          if (sample) memorySamples.push(sample);
        })
        .catch((error) => {
          errors.push(`Memory sampling failed: ${String(error)}`);
        })
        .finally(() => {
          pendingSample = undefined;
        });
    }, 500);
    const run = { rate, counts, samples, errors, memoryBefore, memorySamples };
    runs.push(run);
    await mkdir(resolve(output, '..'), { recursive: true });
    async function measure(name: string, iteration: number, action: () => Promise<unknown>) {
      const before = await cdp.send('Performance.getMetrics');
      const started = performance.now();
      let result: unknown;
      try {
        result = await action();
      } catch (error) {
        samples.push({
          name,
          iteration,
          failed: true,
          elapsedMs: performance.now() - started,
          error: String(error),
        });
        throw error;
      }
      await page.evaluate(
        () =>
          new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          ),
      );
      const elapsedMs = performance.now() - started;
      const after = await cdp.send('Performance.getMetrics');
      const value = (metrics: typeof after, key: string) =>
        metrics.metrics.find((m) => m.name === key)?.value ?? 0;
      const taskDelta = value(after, 'TaskDuration') - value(before, 'TaskDuration');
      const inputToReadableMs =
        result && typeof result === 'object' && 'inputToReadableMs' in result
          ? (result as { inputToReadableMs?: unknown }).inputToReadableMs
          : undefined;
      const sample = {
        name,
        iteration,
        elapsedMs,
        jsHeapUsedBytes: value(after, 'JSHeapUsedSize'),
        // A document navigation can reset Chromium's cumulative task counter.
        taskDurationMs: taskDelta < 0 ? null : taskDelta * 1000,
        ...(typeof inputToReadableMs === 'number' ? { inputToReadableMs } : {}),
      };
      samples.push(sample);
      console.log(JSON.stringify({ rate, ...sample }));
      // Save completed operations even if a later memory test kills the runner.
      await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    }

    try {
      for (let iteration = 0; iteration < repetitions; iteration += 1) {
        await measure('dashboard-load', iteration, async () => {
          await page.goto(`${origin}/`);
          await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible();
          await expect(page.getByText('Heavy course 0', { exact: true }).first()).toBeVisible();
        });
        await measure('global-search', iteration, async () => {
          await page.getByRole('button', { name: 'Quick search' }).click();
          await page.getByRole('combobox').fill('Recall item 0-0-99');
          await expect(
            page.getByRole('option').filter({ hasText: 'Recall item 0-0-99' }).first(),
          ).toBeVisible();
        });
        await page.keyboard.press('Escape');
        await measure('course-open', iteration, async () => {
          await page.getByText('Heavy course 0', { exact: true }).first().click();
          await expect(
            page.getByRole('heading', { name: 'Curriculum', exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole('button', { name: 'Heavy lesson 0', exact: true }),
          ).toBeVisible();
        });
        await measure('cards-open', iteration, async () => {
          await page
            .getByRole('navigation', { name: 'Course sections' })
            .getByRole('link', { name: 'Cards', exact: true })
            .click();
          await expect(page.getByPlaceholder('Search all cards…')).toBeVisible();
          await expect(page.getByText(/Recall item 0-/).first()).toBeVisible();
        });
        await measure('cards-search', iteration, async () => {
          await page.getByPlaceholder('Search all cards…').fill('Recall item 0-0-99');
          await expect(
            page
              .getByText(
                'Recall item 0-0-99: explain the relationship between energy and motion.',
                { exact: true },
              )
              .first(),
          ).toBeVisible();
          await expect(
            page.getByText(
              'Recall item 0-0-0: explain the relationship between energy and motion.',
              { exact: true },
            ),
          ).toHaveCount(0);
        });
        await measure('study-open', iteration, async () => {
          await page.goto(`${origin}/#/course/heavy-course-0/learn`);
          await expect(page.locator('[data-study-card-id]').first()).toBeVisible();
        });
        await measure('answer-reveal', iteration, async () => {
          const result = await clickToReadable(
            page,
            page.getByRole('button', { name: /Show answer/i }).last(),
            '[data-study-face="back"]',
            'Doubling speed',
          );
          await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
          return result;
        });
        const cardId = await page
          .locator('[data-study-card-id]')
          .first()
          .getAttribute('data-study-card-id');
        await measure('review-next-card', iteration, async () => {
          return clickToReadable(
            page,
            page.getByRole('button', { name: 'Yes', exact: true }),
            '[data-study-face="front"]',
            'Recall item',
            cardId!,
          );
        });
      }
      for (let burst = 0; burst < burstReviews; burst += 1) {
        await measure('burst-answer-reveal', burst, async () => {
          const result = await clickToReadable(
            page,
            page.getByRole('button', { name: /Show answer/i }).last(),
            '[data-study-face="back"]',
            'Doubling speed',
          );
          await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
          return result;
        });
        const burstCardId = await page
          .locator('[data-study-card-id]')
          .first()
          .getAttribute('data-study-card-id');
        await measure('burst-review-next-card', burst, async () =>
          clickToReadable(
            page,
            page.getByRole('button', { name: 'Yes', exact: true }),
            '[data-study-face="front"]',
            'Recall item',
            burstCardId!,
          ),
        );
      }
      if (!quick) await page.goto(`${origin}/#/settings#settings-export`);
      let backupPath: string | undefined;
      if (!quick)
        await measure('backup-export', 0, async () => {
          const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
          await page.getByRole('button', { name: 'Full backup Complete database' }).click();
          const download = await downloadPromise;
          const path = await download.path();
          if (!path || (await download.failure())) throw new Error('Backup download failed');
          backupPath = path;
          samples.push({ name: 'backup-size', bytes: (await stat(path)).size });
        });
      if (!quick)
        await measure('backup-preview', 0, async () => {
          await page.getByLabel('Recover this installation').setInputFiles(backupPath!);
          await expect(page.getByRole('button', { name: 'Replace local data' })).toBeVisible();
        });
      if (!quick) await page.getByRole('button', { name: 'Replace local data' }).click();
      if (!quick)
        await measure('backup-replace', 0, async () => {
          await page.getByRole('button', { name: 'Replace local data' }).click();
          await expect(page.getByText('Data replaced from backup.')).toBeVisible({
            timeout: 180_000,
          });
        });
      expect(errors).toEqual([]);
    } catch (error) {
      errors.push(String(error));
      await mkdir(resolve(output, '..'), { recursive: true });
      await page
        .screenshot({ path: output.replace(/\.json$/, `-${rate}-failure.png`) })
        .catch(() => {});
      console.error(`Performance run at ${rate}x failed: ${String(error)}`);
      process.exitCode = 1;
    } finally {
      clearInterval(timer);
      await pendingSample;
      const finalMemory = await linuxMemory();
      if (finalMemory) memorySamples.push(finalMemory);
      await writeFile(output, JSON.stringify(report, null, 2) + '\n');
      await context.close();
      activeContext = undefined;
      if (runProfile) await removeOwnedProfile(runProfile);
      activeRunProfile = undefined;
    }
  }
  report.completed = true;
} finally {
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await activeContext?.close();
  if (activeRunProfile) await removeOwnedProfile(activeRunProfile);
  await browser?.close();
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  await new Promise<void>((done) => server.close(() => done()));
}
