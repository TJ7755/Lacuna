// Compare frozen production builds in disposable browser stores; animations stay enabled.
import { chromium, expect as baseExpect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { cpus, totalmem, platform } from 'node:os';
import { createHash } from 'node:crypto';

const root = resolve(process.argv[2] ?? 'dist');
const output = resolve(process.argv[3] ?? 'artifacts/performance/cards.json');
const repetitions = Number(process.env.PERF_REPETITIONS ?? 3);
const rate = Number(process.env.PERF_RATE ?? 4);
const imageSource = process.env.PERF_IMAGE_SOURCE ?? 'asset';
const expect = baseExpect.configure({ timeout: 30000 });
await mkdir(dirname(output), { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!path.startsWith(root + sep)) return response.writeHead(403).end();
  try {
    const body =
      pathname === '/__fixture'
        ? '<!doctype html><title>Cards fixture</title>'
        : await readFile(path);
    response
      .writeHead(200, {
        'Content-Type':
          pathname === '/__fixture'
            ? 'text/html'
            : (mime[extname(path)] ?? 'application/octet-stream'),
      })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const report = {
  schemaVersion: 3,
  build: root,
  buildIndexSha256: createHash('sha256')
    .update(await readFile(resolve(root, 'index.html')))
    .digest('hex'),
  harnessSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
  measuredAt: new Date().toISOString(),
  platform: platform(),
  cpu: cpus()[0].model,
  totalMemoryBytes: totalmem(),
  browser: browser.version(),
  rate,
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
  fixture: { cards: 800, lessons: 20, diagrams: 100, regionsPerDiagram: 4, imageSource },
  method:
    'Wall clock includes Playwright overhead. Input-to-readable starts at pointerdown/input in the renderer and ends after readable content and two frames. Fresh context per repetition; warm revisit shares that context. Profiling is optional and must be compared separately.',
  runs: [],
  failures: [],
};
try {
  for (let iteration = 0; iteration < repetitions; iteration++) {
    const context = await browser.newContext({
      viewport: report.viewport,
      reducedMotion: 'no-preference',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/__fixture`);
    await page.addScriptTag({ path: 'artifacts/performance/fixture.js' });
    await page.evaluate(async (imageSource) => {
      await window.LacunaHeavyFixture.seed(true);
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const read = (name) =>
        new Promise((resolve, reject) => {
          const request = db.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [cards, lessons, units] = await Promise.all(
        ['cards', 'lessons', 'schedulingUnits'].map(read),
      );
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#26796c';
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.fillStyle = '#f0e8c8';
      ctx.font = '48px sans-serif';
      ctx.fillText('Cell structure', 180, 500);
      const embeddedImage = canvas.toDataURL('image/png');
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await new Promise((resolve, reject) => {
        const tx = db.transaction(
          ['cards', 'lessons', 'schedulingUnits', 'occlusions', 'assets', 'reviewHistory'],
          'readwrite',
        );
        tx.objectStore('cards').clear();
        tx.objectStore('lessons').clear();
        tx.objectStore('reviewHistory').clear();
        const now = Date.now();
        for (let l = 0; l < 20; l++) {
          const lessonId = `cards-lesson-${l}`;
          tx.objectStore('lessons').put({
            ...lessons[0],
            id: lessonId,
            name: `Image topic ${l}`,
            orderIndex: l,
          });
          tx.objectStore('schedulingUnits').put({
            ...units.find((u) => u.lessonId),
            id: lessonId,
            lessonId,
          });
          for (let i = 0; i < 40; i++) {
            const index = l * 40 + i;
            const generated = i < 20;
            const group = Math.floor(index / 4);
            const hash = (group + 1).toString(16).padStart(64, '0');
            const regionId = generated ? `diagram-${group}-region-${i % 4}` : undefined;
            if (i % 4 === 0) {
              tx.objectStore('assets').put({
                hash,
                blob: bytes,
                mimeType: 'image/png',
                kind: 'image',
                width: 1024,
                height: 1024,
                createdAt: now,
              });
              if (generated)
                tx.objectStore('occlusions').put({
                  id: `diagram-${group}`,
                  courseId: 'heavy-course-0',
                  primaryLessonId: lessonId,
                  name: `Cell diagram ${group}`,
                  assetHash: hash,
                  createdAt: now,
                  updatedAt: now,
                  regions: Array.from({ length: 4 }, (_, r) => ({
                    id: `diagram-${group}-region-${r}`,
                    role: 'label',
                    shape: 'rectangle',
                    x: 0.1 + r * 0.2,
                    y: 0.3,
                    w: 0.15,
                    h: 0.1,
                    answerText: `Nucleus ${group}-${r}`,
                  })),
                });
            }
            tx.objectStore('cards').put({
              ...cards[0],
              id: `image-card-${index}`,
              conceptId: `image-concept-${index}`,
              primaryLessonId: lessonId,
              schedulingUnitId: lessonId,
              deckId: lessonId,
              front: generated
                ? `Label ${(i % 4) + 1} of 4 — Cell diagram ${group}`
                : `Recall image ${index}\n\n![Cell structure](${imageSource === 'embedded' ? embeddedImage : `lacuna-asset://${hash}`})`,
              back: `Nucleus answer ${index}`,
              history: [],
              occlusionRegionId: regionId,
            });
          }
        }
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, imageSource);
    // Count actual IndexedDB reads, including reads issued by Dexie.
    await page.addInitScript(() => {
      window.__reads = {};
      window.__longTasks = [];
      new PerformanceObserver((list) => {
        window.__longTasks.push(
          ...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })),
        );
      }).observe({ type: 'longtask', buffered: true });
      for (const method of ['getAll', 'get', 'openCursor', 'count']) {
        for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype]) {
          const original = proto[method];
          proto[method] = function (...args) {
            const key = `${this.objectStore?.name ?? this.name}.${method}`;
            window.__reads[key] = (window.__reads[key] ?? 0) + 1;
            return original.apply(this, args);
          };
        }
      }
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await cdp.send('Performance.enable');
    const run = { iteration, errors, samples: [] };
    report.runs.push(run);
    async function measure(name, action, ready) {
      await page.evaluate((name) => {
        window.__reads = {};
        window.__longTasks = [];
        const state = { start: null, end: null, cancelled: false };
        const begin = () => {
          if (state.start !== null) return;
          state.start = performance.now();
          const check = () => {
            if (state.cancelled) return;
            const rows = document.querySelectorAll('[data-card-id]');
            const course = name.startsWith('course-');
            const target = course
              ? [...document.querySelectorAll('main h1')].find(
                  (node) => node.textContent === 'Heavy course 0',
                )
              : document.querySelector('[data-card-id] .prose-lacuna');
            const matches =
              course ||
              (name === 'search-last-card'
                ? rows.length === 1 && target?.textContent.includes('Recall image 799')
                : rows.length > 1);
            let opacity = 1;
            let element = target;
            while (element) {
              opacity *= Number(getComputedStyle(element).opacity);
              element = element.parentElement;
            }
            const rect = target?.getBoundingClientRect();
            if (
              !matches ||
              !rect?.height ||
              rect.bottom <= 0 ||
              rect.top >= innerHeight ||
              opacity < 0.9
            ) {
              requestAnimationFrame(check);
              return;
            }
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.end = performance.now();
              }),
            );
          };
          requestAnimationFrame(check);
        };
        window.addEventListener('pointerdown', begin, { capture: true, once: true });
        window.addEventListener('input', begin, { capture: true, once: true });
        window.__interaction = state;
        window.__stopInteraction = () => {
          state.cancelled = true;
          window.removeEventListener('pointerdown', begin, true);
          window.removeEventListener('input', begin, true);
        };
      }, name);
      const profiling = process.env.PERF_PROFILE === '1';
      if (profiling) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.start');
      }
      const beforeMetrics = await cdp.send('Performance.getMetrics');
      const start = performance.now();
      await action();
      await ready();
      await expect
        .poll(() => page.evaluate(() => window.__interaction.end), { timeout: 30000 })
        .not.toBeNull();
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      const elapsedMs = performance.now() - start;
      const counts = await page.evaluate(() => ({
        inputToReadableMs: window.__interaction.end - window.__interaction.start,
        longTasks: window.__longTasks.filter(
          ({ startTime }) =>
            startTime >= window.__interaction.start && startTime <= window.__interaction.end,
        ),
        reads: window.__reads,
        rows: document.querySelectorAll('[data-card-id]').length,
        images: document.querySelectorAll('main img').length,
        nodes: document.querySelectorAll('main *').length,
      }));
      const metrics = await cdp.send('Performance.getMetrics');
      const sample = {
        name,
        elapsedMs,
        ...counts,
        heapBytes: metrics.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value,
      };
      for (const metric of [
        'TaskDuration',
        'ScriptDuration',
        'LayoutDuration',
        'RecalcStyleDuration',
      ]) {
        sample[metric] =
          metrics.metrics.find((m) => m.name === metric).value -
          beforeMetrics.metrics.find((m) => m.name === metric).value;
      }
      run.samples.push(sample);
      await page.evaluate(() => window.__stopInteraction());
      if (profiling) {
        const { profile } = await cdp.send('Profiler.stop');
        await writeFile(
          output.replace(/\.json$/, `-${iteration}-${name}.cpuprofile`),
          JSON.stringify(profile),
        );
      }
      console.log(JSON.stringify({ iteration, ...sample }));
      await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    }
    await page.goto(`${origin}/#/`);
    const courseLink = page.getByRole('button', { name: 'Heavy course 0', exact: true });
    await expect(courseLink).toBeVisible({ timeout: 30000 });
    const heading = () =>
      expect(page.getByRole('heading', { name: 'Heavy course 0', exact: true })).toBeVisible({
        timeout: 30000,
      });
    await measure('course-cold', () => courseLink.click(), heading);
    const cardsLink = () =>
      page
        .getByRole('navigation', { name: 'Course sections' })
        .first()
        .getByRole('link', { name: 'Cards', exact: true });
    await measure(
      'cards-cold',
      () => cardsLink().click(),
      () => expect(page.locator('[data-card-id]').first()).toBeVisible({ timeout: 30000 }),
    );
    await page.waitForTimeout(750);
    await page.screenshot({ path: output.replace(/\.json$/, `-${iteration}.png`) });
    expect(errors, 'browser runtime errors').toEqual([]);
    await measure(
      'search-last-card',
      () => page.getByLabel('Search all cards').fill('Recall image 799'),
      () => expect(page.locator('[data-card-id]')).toHaveCount(1, { timeout: 30000 }),
    );
    await measure(
      'clear-search',
      () => page.getByLabel('Search all cards').fill(''),
      () => expect.poll(() => page.locator('[data-card-id]').count()).toBeGreaterThan(1),
    );
    await measure(
      'fill-broad-query',
      () => page.getByLabel('Search all cards').fill('Nucleus'),
      () => expect(page.getByLabel('Search all cards')).toHaveValue('Nucleus'),
    );
    await measure(
      'clear-broad-query',
      () => page.getByLabel('Search all cards').fill(''),
      () => expect(page.getByLabel('Search all cards')).toHaveValue(''),
    );
    // A broad query keeps image rows mounted while every character updates the URL.
    // Record renderer input-to-paint separately from Playwright wall-clock overhead.
    await page.evaluate(() => {
      window.__typedPaints = [];
      document
        .querySelector('[aria-label="Search all cards"]')
        .addEventListener('input', (event) => {
          const value = event.target.value;
          const start = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.__typedPaints.push({ value, inputToPaintMs: performance.now() - start });
            }),
          );
        });
      window.__longTasks = [];
    });
    const beforeTyping = await cdp.send('Performance.getMetrics');
    if (process.env.PERF_PROFILE === '1') {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
    }
    const typingStarted = performance.now();
    await page.getByLabel('Search all cards').pressSequentially('Nucleus', { delay: 30 });
    await expect.poll(() => page.evaluate(() => window.__typedPaints.length)).toBe(7);
    const afterTyping = await cdp.send('Performance.getMetrics');
    const typed = await page.evaluate(() => ({
      value: document.querySelector('[aria-label="Search all cards"]').value,
      paints: window.__typedPaints,
      longTasks: window.__longTasks,
      rows: document.querySelectorAll('[data-card-id]').length,
      images: document.querySelectorAll('main img').length,
    }));
    const typingSample = {
      name: 'type-broad-query',
      elapsedMs: performance.now() - typingStarted,
      ...typed,
    };
    for (const metric of [
      'TaskDuration',
      'ScriptDuration',
      'LayoutDuration',
      'RecalcStyleDuration',
    ]) {
      typingSample[metric] =
        afterTyping.metrics.find((m) => m.name === metric).value -
        beforeTyping.metrics.find((m) => m.name === metric).value;
    }
    if (process.env.PERF_PROFILE === '1') {
      const { profile } = await cdp.send('Profiler.stop');
      await writeFile(
        output.replace(/\.json$/, `-${iteration}-type-broad-query.cpuprofile`),
        JSON.stringify(profile),
      );
    }
    if (typed.value !== 'Nucleus') {
      report.failures.push({
        iteration,
        name: typingSample.name,
        expected: 'Nucleus',
        actual: typed.value,
      });
    } else {
      await expect(
        page.locator('[aria-live="polite"]').filter({ hasText: /^800 cards$/ }),
      ).toBeVisible();
    }
    run.samples.push(typingSample);
    console.log(JSON.stringify({ iteration, ...typingSample }));
    await page.getByLabel('Search all cards').fill('no-such-nucleus-card');
    await expect(page.getByText(/No cards match.*no-such-nucleus-card/)).toBeVisible();
    await expect(page.locator('[data-card-id]')).toHaveCount(0);
    await measure(
      'clear-miss',
      () => page.getByLabel('Search all cards').fill(''),
      () => expect.poll(() => page.locator('[data-card-id]').count()).toBeGreaterThan(1),
    );
    await page.getByRole('link', { name: 'Today', exact: true }).first().click();
    await expect(courseLink).toBeVisible();
    await measure('course-warm', () => courseLink.click(), heading);
    await measure(
      'cards-warm',
      () => cardsLink().click(),
      () => expect(page.locator('[data-card-id]').first()).toBeVisible(),
    );
    await page.screenshot({ path: output.replace(/\.json$/, `-${iteration}.png`) });
    expect(errors, 'browser runtime errors after revisiting').toEqual([]);
    await context.close();
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  }
  expect(report.failures, 'typed query preserved').toEqual([]);
} finally {
  await browser.close();
  server.close();
}
