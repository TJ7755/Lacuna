import { expect, test, type Page, type Locator } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
async function measureCard(page: Page, trigger: Locator, previousId: string | null = null) {
  await page.evaluate((previousId) => {
    Object.assign(window, { studyCardTiming: null });
    window.addEventListener('pointerdown', () => {
      performance.mark('study-probe:click');
      const start = performance.now();
      function sample() {
        const face = document.querySelector<HTMLElement>('[data-study-face="front"]');
        const card = face?.closest('[data-study-card-id]');
        const images = [...(face?.querySelectorAll('img') ?? [])];
        let opacity = 1;
        for (let el: Element | null = face ?? null; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
        if (face && card?.getAttribute('data-study-card-id') !== previousId && opacity >= 0.9 &&
          !face.closest('[inert]') && images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0)) {
          performance.mark('study-probe:card-painted');
          Object.assign(window, { studyCardTiming: performance.now() - start });
        } else if (performance.now() - start < 30_000) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, { once: true, capture: true });
  }, previousId);
  await trigger.click();
  await page.waitForFunction(() => (window as unknown as { studyCardTiming: number | null }).studyCardTiming !== null, undefined, { timeout: 35_000 });
  return page.evaluate(() => (window as unknown as { studyCardTiming: number }).studyCardTiming);
}

test('measures image-heavy study startup', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const bundle = await build({
    entryPoints: ['tests/e2e/fixtures/studySessionLoad.ts'], bundle: true, write: false,
    platform: 'browser', format: 'iife', globalName: 'StudyLoadFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  await page.route('**/__study_fixture', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Study fixture</title>' }));
  await page.goto('/__study_fixture');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const fixture = await page.evaluate(async () => (window as unknown as { StudyLoadFixture: { seed(): Promise<unknown> } }).StudyLoadFixture.seed());
  await page.addInitScript(() => {
    // Keep the measured image sequence fixed while the production scheduler shuffles ties.
    Math.random = () => 1 - Number.EPSILON;
    const create = URL.createObjectURL;
    URL.createObjectURL = function (blob) {
      performance.mark('study-probe:object-url');
      return create.call(this, blob);
    };
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      performance.mark('study-probe:decode');
      return decode.call(this);
    };
    for (const prototype of [IDBObjectStore.prototype, IDBIndex.prototype]) for (const method of ['get', 'getAll', 'openCursor'] as const) {
      const original = prototype[method];
      Object.assign(prototype, { [method]: function (this: IDBObjectStore | IDBIndex, ...args: unknown[]) {
        const start = performance.now();
        const request = Reflect.apply(original, this, args) as IDBRequest;
        let rows = 0;
        request.addEventListener('success', () => {
          if (method === 'openCursor' && request.result) { rows++; return; }
          performance.measure(`study-probe:db:${this instanceof IDBIndex ? this.objectStore.name + ':' : ''}${this.name}:${method}`, { start, end: performance.now(), detail: { rows } });
        });
        return request;
      } });
    }
  });
  await page.goto('/#/course/heavy-course-0');
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  const start = page.getByRole('region', { name: 'Session preview' }).getByRole('button', { name: 'Start session' }).first();
  await expect(start).toBeEnabled();
  await page.evaluate(() => { performance.clearMarks(); performance.clearMeasures(); performance.mark('lacuna:measure-study-startup'); });
  const firstCardMs = await measureCard(page, start);
  const firstId = await page.locator('[data-study-face="front"]').evaluate((face) => face.closest('[data-study-card-id]')!.getAttribute('data-study-card-id'));
  expect(firstId).toBe('biology-card-000');
  const details = await page.evaluate(() => ({
    measures: (performance.getEntriesByType('measure') as PerformanceMeasure[]).map(({ name, startTime, duration, detail }) => ({ name, startTime, duration, detail })),
    marks: performance.getEntriesByType('mark').map(({ name, startTime }) => ({ name, startTime })),
    faces: document.querySelectorAll('[data-study-face]').length,
    images: [...document.querySelectorAll<HTMLImageElement>('[data-study-face] img')].map((img) => ({ complete: img.complete, width: img.naturalWidth })),
  }));
  const control = page.locator('[data-study-face="front"]').locator('xpath=ancestor::*[@role="button"][1]');
  await expect(control).toBeEnabled();
  await control.press('Enter');
  await expect(page.locator('[data-study-face="back"]')).toBeVisible();
  const secondCardMs = await measureCard(page, page.getByRole('button', { name: 'Yes', exact: true }), firstId);
  const advance = await page.evaluate(() => ({
    measures: (performance.getEntriesByType('measure') as PerformanceMeasure[]).map(({ name, startTime, duration, detail }) => ({ name, startTime, duration, detail })),
    marks: performance.getEntriesByType('mark').map(({ name, startTime }) => ({ name, startTime })),
    resources: performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.js')).map(({ name, startTime, duration }) => ({ name: name.split('/').pop(), startTime, duration })),
  }));
  await expect(page.locator('[data-study-card-id="biology-card-001"] [data-study-face="front"]')).toBeVisible();
  const result = { fixture, firstCardMs, secondCardMs, ...details, advance };
  await writeFile(testInfo.outputPath('study-startup.json'), JSON.stringify(result, null, 2));
  await testInfo.attach('study-startup.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(secondCardMs).toBeLessThan(1500);
  expect(firstCardMs).toBeLessThan(Number(process.env.STUDY_STARTUP_BUDGET_MS ?? 2500));
});
