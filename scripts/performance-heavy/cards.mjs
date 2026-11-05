// Compare frozen production builds in disposable browser stores; animations stay enabled.
import { chromium, expect as baseExpect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { cpus, totalmem, platform } from 'node:os';

const root = resolve(process.argv[2] ?? 'dist');
const output = resolve(process.argv[3] ?? 'artifacts/performance/cards.json');
const repetitions = Number(process.env.PERF_REPETITIONS ?? 3);
const rate = Number(process.env.PERF_RATE ?? 4);
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
  build: root,
  measuredAt: new Date().toISOString(),
  platform: platform(),
  cpu: cpus()[0].model,
  totalMemoryBytes: totalmem(),
  browser: browser.version(),
  rate,
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
  fixture: { cards: 800, lessons: 20, diagrams: 100, regionsPerDiagram: 4 },
  method:
    'Wall clock through visible result and two frames; includes Playwright overhead. Fresh context per repetition; warm revisit shares that context.',
  runs: [],
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
    await page.evaluate(async () => {
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
                : `Recall image ${index}\n\n![Cell structure](lacuna-asset://${hash})`,
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
    });
    // Count actual IndexedDB reads, including reads issued by Dexie.
    await page.addInitScript(() => {
      window.__reads = {};
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
      await page.evaluate(() => {
        window.__reads = {};
      });
      const start = performance.now();
      await action();
      await ready();
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      const elapsedMs = performance.now() - start;
      const counts = await page.evaluate(() => ({
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
      run.samples.push(sample);
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
} finally {
  await browser.close();
  server.close();
}
