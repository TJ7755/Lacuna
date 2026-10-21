import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { largeStudyImages, type StudyImageFixture } from './fixtures/largeStudyImages';

interface ImageProbeEntry {
  kind: string;
  at: number;
  duration?: number;
  url?: string;
  hash?: string;
  bytes?: number;
  width?: number;
  height?: number;
  cardId?: string | null;
  sizing?: boolean;
}
interface AdvanceSample {
  cardId: string;
  gradeAt: number;
  frameMs: number;
  imageElementMs: number;
  loadedMs: number;
  decodedMs: number;
  paintedMs: number;
  url: string;
  firstFrameHeight: number;
  finalFrameHeight: number;
}
interface ProbeWindow extends Window {
  imageProbe: ImageProbeEntry[];
  imageAdvance?: AdvanceSample;
}

async function measureAdvance(page: Page, cardId: string) {
  await page.evaluate((cardId) => {
    const target = window as unknown as ProbeWindow;
    target.imageAdvance = undefined;
    window.addEventListener('pointerdown', () => {
      const gradeAt = performance.now();
      performance.mark(`advance:${cardId}:grade`);
      let frameMs = -1, imageElementMs = -1, loadedMs = -1, decodedMs = -1;
      let firstFrameHeight = 0;
      let decoding = false;
      let decodedFrames = 0;
      function sample() {
        const face = document.querySelector<HTMLElement>(`[data-study-card-id="${cardId}"]:not([inert]) [data-study-face="front"]`);
        const surface = face?.closest<HTMLElement>('.study-card-surface');
        const height = surface?.getBoundingClientRect().height ?? 0;
        if (face && height > 0 && frameMs < 0) { frameMs = performance.now() - gradeAt; firstFrameHeight = height; }
        const image = face?.querySelector('img');
        if (image && imageElementMs < 0) imageElementMs = performance.now() - gradeAt;
        if (image?.complete && image.naturalWidth > 0 && !decoding) {
          loadedMs = performance.now() - gradeAt;
          decoding = true;
          void image.decode().then(() => { decodedMs = performance.now() - gradeAt; });
        }
        let opacity = 1;
        for (let el: Element | null = face ?? null; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
        if (decodedMs >= 0 && ++decodedFrames >= 2 && opacity >= 0.99 && image && image.getBoundingClientRect().height > 0) {
          performance.mark(`advance:${cardId}:painted`);
          target.imageAdvance = { cardId, gradeAt, frameMs, imageElementMs, loadedMs, decodedMs,
            paintedMs: performance.now() - gradeAt, url: image.currentSrc,
            firstFrameHeight, finalFrameHeight: height };
        } else if (performance.now() - gradeAt < 15_000) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, { once: true, capture: true });
  }, cardId);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as ProbeWindow).imageAdvance !== undefined, undefined, { timeout: 20_000 });
  return page.evaluate(() => (window as unknown as ProbeWindow).imageAdvance!);
}

const directory = join(tmpdir(), 'lacuna-study-images-v1');
let images: StudyImageFixture[];

test.beforeAll('Generate original-sized JPEG and PNG fixtures', async () => {
  // Cold image compression must not consume the browser measurement deadline.
  test.setTimeout(600_000);
  images = await largeStudyImages(directory);
});

test('measures original-sized JPEG and PNG card advances at 4x CPU slowdown', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.route('**/__study_image/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    await route.fulfill({ contentType: name.endsWith('.png') ? 'image/png' : 'image/jpeg', body: await readFile(join(directory, name)) });
  });
  const bundle = await build({
    entryPoints: ['tests/e2e/fixtures/studyImageAdvance.ts'], bundle: true, write: false,
    platform: 'browser', format: 'iife', globalName: 'StudyLoadFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  await page.route('**/__study_fixture', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Study fixture</title>' }));
  await page.goto('/__study_fixture');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const fixture = await test.step('Seed the image-card library', () => page.evaluate(async (images) => (window as unknown as {
    StudyLoadFixture: { seed(images: unknown): Promise<unknown> };
  }).StudyLoadFixture.seed(images), images));
  await page.addInitScript(() => {
    // Keep the measured image sequence fixed while the production scheduler shuffles ties.
    Math.random = () => 1 - Number.EPSILON;
    const entries: ImageProbeEntry[] = [];
    Object.assign(window, { imageProbe: entries });
    const create = URL.createObjectURL;
    URL.createObjectURL = function (blob) {
      const url = create.call(this, blob);
      entries.push({ kind: 'object-url', at: performance.now(), url, bytes: blob instanceof Blob ? blob.size : undefined });
      return url;
    };
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      const at = performance.now();
      const url = this.src;
      try {
        await decode.call(this);
        entries.push({ kind: 'decode-complete', at, duration: performance.now() - at, url,
          width: this.naturalWidth, height: this.naturalHeight });
      } catch (error) {
        entries.push({ kind: 'decode-failed', at, duration: performance.now() - at, url });
        throw error;
      }
    };
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      const request = get.call(this, key);
      if (this.name === 'assets') {
        const at = performance.now();
        request.addEventListener('success', () => entries.push({ kind: 'asset-read', at, duration: performance.now() - at,
          hash: String(key), bytes: request.result?.blob?.byteLength ?? request.result?.blob?.size }));
      }
      return request;
    };
    document.addEventListener('load', (event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      const image = event.target;
      entries.push({ kind: 'image-load', at: performance.now(), url: image.currentSrc,
        cardId: image.closest('[data-study-card-id]')?.getAttribute('data-study-card-id'),
        sizing: Boolean(image.closest('[data-study-sizing-face]')) });
    }, true);
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.assign(HTMLCanvasElement.prototype, { getContext: function (this: HTMLCanvasElement, ...args: unknown[]) {
      entries.push({ kind: 'canvas-context', at: performance.now() });
      return Reflect.apply(getContext, this, args);
    } });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) entries.push({ kind: 'long-task', at: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask' });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/#/course/heavy-course-0');
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('region', { name: 'Session preview' }).getByRole('button', { name: 'Start session' }).first().click();
  await expect(page.locator('[data-study-face="front"] img')).toBeVisible();
  const samples: AdvanceSample[] = [];
  for (let i = 1; i <= 24; i++) {
    // Short reading dwell plus the normal answer flip; never await a speculative decode.
    await page.waitForTimeout(250);
    await page.locator('[data-study-face="front"]').last().locator('xpath=ancestor::*[@role="button"][1]').press('Enter');
    await expect(page.locator('[data-study-face="back"]').last()).toBeVisible();
    const sample = await measureAdvance(page, `biology-card-${String(i).padStart(3, '0')}`);
    samples.push(sample);
  }
  const probes = await page.evaluate(() => (window as unknown as ProbeWindow).imageProbe);
  const sorted = samples.map((sample) => sample.paintedMs).sort((a, b) => a - b);
  const p50Ms = (sorted[11] + sorted[12]) / 2;
  const worstMs = sorted[sorted.length - 1];
  const result = { fixture, cpuSlowdown: 4, sampleCount: samples.length, p50Ms, worstMs, images, samples, probes };
  await writeFile(testInfo.outputPath('study-image-advance.json'), JSON.stringify(result, null, 2));
  await testInfo.attach('study-image-advance.json', { body: JSON.stringify(result), contentType: 'application/json' });
  await cdp.detach();
  expect(samples.every((sample) => sample.firstFrameHeight / sample.finalFrameHeight >= 0.85)).toBe(true);
  expect(worstMs).toBeLessThan(Number(process.env.STUDY_IMAGE_ADVANCE_BUDGET_MS ?? 1500));
});
