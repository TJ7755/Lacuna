import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type * as Fixture from './fixtures/studyAnimation';

declare global {
  interface Window {
    StudyAnimationFixture: typeof Fixture;
  }
}
let script: string;
const selectors = {
  grade: '[data-study-grade-fill]',
  rim: '[data-study-rim]',
  segments: '[data-session-segment-row]',
};
test.use({ viewport: { width: 900, height: 500 }, trace: 'off', video: 'off' });
test.beforeAll(async () => {
  const result = await build({
    entryPoints: ['tests/e2e/fixtures/studyAnimation.tsx'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'StudyAnimationFixture',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env.DEV': 'false' },
  });
  script = result.outputFiles[0].text;
});

async function mount(page: Page, scene: Fixture.Scene, m = 1, initialIndex = 12) {
  await page.route('**/__study_animation', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `
    <style>body{margin:0;background:white;--positive:0 0% 0%;--negative:0 0% 0%}
    #root{width:810px}.relative{position:relative}.absolute{position:absolute}.flex{display:flex}
    .invisible{visibility:hidden}.sr-only{display:none}.fixture-card{height:200px;background:white}
    button{width:400px;height:200px;background:white;border:0;color:transparent}
    [data-study-grade-fill]{position:absolute;inset:0;background:black}
    [data-study-rim]{position:absolute;inset:0}
    .study-card-surface{width:400px;height:240px;background:black;color:transparent}
    [data-session-segment-row]{height:10px}
    [data-session-card-status]{height:10px;background:black}
    </style><div id="root"></div>`,
    }),
  );
  await page.goto('/__study_animation');
  await page.addScriptTag({ content: script });
  await page.evaluate(
    ({ scene, m, initialIndex }) => window.StudyAnimationFixture.mount(scene, m, initialIndex),
    { scene, m, initialIndex },
  );
  await page.waitForTimeout(600);
}

for (const scene of ['grade', 'rim'] as const) {
  test(`${scene} acknowledges the grade then clears its feedback`, async ({ page }) => {
    await mount(page, scene);
    await page.evaluate((scene) => window.StudyAnimationFixture.start(scene), scene);
    const node = page.locator(selectors[scene]);
    const samples = await node.evaluate(
      (node) =>
        new Promise<number[]>((resolve) => {
          const opacity: number[] = [];
          const started = performance.now();
          const sample = () => {
            opacity.push(Number(getComputedStyle(node).opacity));
            if (performance.now() - started < 500) requestAnimationFrame(sample);
            else resolve(opacity);
          };
          sample();
        }),
    );
    expect(Math.max(...samples)).toBeGreaterThan(0);
    expect(samples.at(-1)!).toBeCloseTo(0);
    if (scene === 'grade') {
      await page.evaluate(() => window.StudyAnimationFixture.change({ serial: 2 }));
      await expect
        .poll(() => node.evaluate((node) => Number(getComputedStyle(node).opacity)))
        .toBeGreaterThan(0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => window.StudyAnimationFixture.change({ m: 0 }));
      await page.waitForTimeout(350);
      await expect(node).toHaveCSS('opacity', '0');
    } else {
      await page.evaluate(() => window.StudyAnimationFixture.cancel());
      await expect(node).toHaveCount(0);
    }
  });
}

for (const scene of ['grade', 'rim', 'segments'] as const) {
  test(`${scene} keeps painting through a busy main thread`, async ({ page }, info) => {
    await mount(page, scene);
    const cdp = await page.context().newCDPSession(page);
    const frames: { time: number; data: string }[] = [];
    cdp.on('Page.screencastFrame', (event) => {
      if (event.metadata.timestamp !== undefined)
        frames.push({ time: event.metadata.timestamp * 1000, data: event.data });
      void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
    });
    let timing: { start: number; end: number };
    try {
      await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
      timing = await page.evaluate(async (scene) => {
        window.StudyAnimationFixture.start(scene);
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (scene === 'rim') {
          // Isolate the rim from the already-native card flight, which otherwise
          // changes the sampled pixel's position during this opacity probe.
          const card = document.querySelector('[data-study-card-id]')!;
          for (const animation of card.getAnimations()) {
            animation.pause();
            animation.currentTime = 0;
          }
          // Let the paused ancestor reach the compositor before blocking JS.
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        }
        const start = Date.now();
        const began = performance.now();
        while (performance.now() - began < 160) {
          /* controlled rendering stall */
        }
        const end = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return { start, end };
      }, scene);
    } finally {
      await cdp.send('Page.stopScreencast');
    }
    const samples = await Promise.all(
      frames.map(async (frame) => {
        const bitmap = sharp(Buffer.from(frame.data, 'base64'));
        const pixels = await (
          scene === 'segments'
            ? bitmap
            : bitmap.extract({ left: scene === 'rim' ? 1 : 200, top: 100, width: 1, height: 1 })
        )
          .raw()
          .toBuffer();
        return {
          ms: frame.time - timing.start,
          value: createHash('sha256').update(pixels).digest('hex'),
        };
      }),
    );
    const active = samples.filter(
      (sample) => sample.ms > 0 && sample.ms < timing.end - timing.start,
    );
    await info.attach(`${scene}-compositor.json`, {
      body: JSON.stringify({ stallMs: timing.end - timing.start, samples }, null, 2),
      contentType: 'application/json',
    });
    expect(new Set(active.map(({ value }) => value)).size).toBeGreaterThanOrEqual(4);
  });
}

test('progress strip keeps the current card visible after navigation and resizing', async ({
  page,
}) => {
  await mount(page, 'segments');
  await page.evaluate(() => window.StudyAnimationFixture.start('segments'));
  await expectCurrentSegmentVisible(page);
  await page.evaluate(() => {
    window.StudyAnimationFixture.change({ m: 0 });
    document.querySelector<HTMLElement>('#root')!.style.width = '156px';
  });
  await expectCurrentSegmentVisible(page);
  await page.evaluate(() => window.StudyAnimationFixture.change({ index: 5 }));
  await expectCurrentSegmentVisible(page, 5);
});

async function expectCurrentSegmentVisible(page: Page, index = 13) {
  const segment = page.locator('[data-session-card-status]').nth(index);
  await expect(segment).toHaveAttribute('data-session-card-status', 'current');
  await expect
    .poll(() =>
      segment.evaluate((node) => {
        const segment = node.getBoundingClientRect();
        const viewport = node.parentElement!.parentElement!.getBoundingClientRect();
        return segment.left >= viewport.left && segment.right <= viewport.right;
      }),
    )
    .toBe(true);
}

test('a session opened beyond its first window retains the measured position', async ({ page }) => {
  await mount(page, 'segments', 1, 13);
  await expectCurrentSegmentVisible(page);
  await page.evaluate(async () => {
    document.querySelector<HTMLElement>('#root')!.style.width = '0';
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#root')!.style.width = '156px';
  });
  await expectCurrentSegmentVisible(page);
});
