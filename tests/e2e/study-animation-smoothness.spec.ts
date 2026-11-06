import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { easeOut, spring } from 'motion';
import type * as Fixture from './fixtures/studyAnimation';

declare global {
  interface Window {
    StudyAnimationFixture: typeof Fixture;
  }
}
let script: string;
const selectors = {
  flip: '.study-card-surface:not([data-study-sizing-face])',
  grade: '[data-study-grade-fill]',
  rim: '[data-study-rim]',
  segments: '[data-session-segment-row]',
  step: '#root > div > div',
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
    // The reading content does not own these animations. Keep this rendering
    // probe independent of Markdown, media loading and database work; real study
    // workflows exercise those owners separately.
    plugins: [
      {
        name: 'plain-reading-face',
        setup(builder) {
          builder.onLoad({ filter: /[\\/]StudyCardFace\.tsx$/ }, () => ({
            loader: 'jsx',
            contents:
              'export function StudyCardFace({side,measuring}){return <div data-study-face={measuring?undefined:side}>{side}</div>}',
          }));
        },
      },
    ],
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

for (const scene of ['flip', 'grade', 'rim', 'segments', 'step'] as const) {
  test(`${scene} uses native animation with its existing choreography`, async ({ page }, info) => {
    await mount(page, scene);
    await page.evaluate((scene) => window.StudyAnimationFixture.start(scene), scene);
    const target = page.locator(selectors[scene]).last();
    await expect
      .poll(() => target.evaluate((node) => node.getAnimations().length))
      .toBeGreaterThan(0);
    const animations = await target.evaluate((node) =>
      node.getAnimations().map((animation) => ({
        timing: animation.effect!.getTiming(),
        frames: (animation.effect as KeyframeEffect).getKeyframes(),
      })),
    );
    await info.attach(`${scene}-native.json`, {
      body: JSON.stringify(animations, null, 2),
      contentType: 'application/json',
    });
    const property = scene === 'segments' || scene === 'flip' ? 'transform' : 'opacity';
    const animation = animations.find(({ frames }) =>
      frames.some((frame) => frame[property] !== undefined),
    );
    expect(animation).toBeDefined();
    if (scene !== 'segments')
      expect(animation!.timing.duration).toBe(
        { flip: 280, grade: 240, rim: 320, step: 220 }[scene],
      );
    if (scene === 'flip') {
      await expect(page.locator('[data-study-face="back"]')).toBeVisible();
      await expect(target).toHaveCSS('transform', 'none');
    }
  });
}

for (const scene of ['grade', 'rim'] as const)
  for (const m of [0.6, 1, 1.4]) {
    test(`${scene} retains the full opacity curve at multiplier ${m}`, async ({ page }) => {
      await mount(page, scene, m);
      await page.evaluate((scene) => window.StudyAnimationFixture.start(scene), scene);
      const node = page.locator(selectors[scene]);
      await expect.poll(() => node.evaluate((node) => node.getAnimations().length)).toBe(1);
      const samples = await node.evaluate((node) => {
        const animation = node.getAnimations()[0];
        animation.pause();
        const duration = Number(animation.effect!.getTiming().duration);
        return [0, 0.1, 0.2, 0.5, 0.9, 1].map((progress) => {
          animation.currentTime = duration * progress;
          return { progress, opacity: Number(getComputedStyle(node).opacity) };
        });
      });
      const peak = scene === 'grade' ? 0.3 : 1;
      for (const { progress, opacity } of samples)
        expect(opacity).toBeCloseTo(
          progress <= 0.2
            ? peak * easeOut(progress / 0.2)
            : peak * (1 - easeOut((progress - 0.2) / 0.8)),
          4,
        );
      if (scene === 'grade') {
        await page.evaluate(() => window.StudyAnimationFixture.change({ serial: 2 }));
        await expect.poll(() => node.evaluate((node) => node.getAnimations().length)).toBe(1);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => window.StudyAnimationFixture.change({ m: 0 }));
        await page.waitForTimeout(350);
        await expect(node).toHaveCSS('opacity', '0');
        expect(await node.evaluate((node) => node.getAnimations().length)).toBe(0);
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

test('study-step CSS retains its original delays, durations and movement', async ({ page }) => {
  await mount(page, 'step');
  await page.addStyleTag({
    content: readFileSync(resolve('apps/web/src/components/learn/StudyStepTransition.css'), 'utf8'),
  });
  const timing = await page.evaluate(() => {
    const root = document.querySelector('#root')!;
    root.innerHTML =
      '<div class="study-transition" style="--step-motion:1"><h1 class="study-transition-heading">Next</h1><div class="study-transition-actions">Continue</div></div>';
    return ['.study-transition-heading', '.study-transition-actions'].map((selector) => {
      const animation = document.querySelector(selector)!.getAnimations()[0];
      return {
        duration: animation.effect!.getTiming().duration,
        delay: animation.effect!.getTiming().delay,
        frames: (animation.effect as KeyframeEffect).getKeyframes(),
      };
    });
  });
  expect(Number(timing[0].duration)).toBeCloseTo(800, 5);
  expect(timing[0].delay).toBeCloseTo(420, 5);
  expect(Number(timing[1].duration)).toBeCloseTo(700, 5);
  expect(timing[1].delay).toBeCloseTo(660, 5);
  expect(
    timing.every(({ frames }) => frames.some((frame) => String(frame.transform).includes('14px'))),
  ).toBe(true);
});

test('progress-strip movement retains its spring and snaps resized geometry', async ({ page }) => {
  await mount(page, 'segments');
  await page.evaluate(() => window.StudyAnimationFixture.start('segments'));
  const row = page.locator(selectors.segments);
  await expect.poll(() => row.evaluate((node) => node.getAnimations().length)).toBe(1);
  const sample = await row.evaluate((node) => {
    const animation = node.getAnimations()[0];
    animation.pause();
    const duration = Number(animation.effect!.getTiming().duration);
    const positions = [50, 150, 300].map((ms) => {
      animation.currentTime = ms;
      return { ms, x: new DOMMatrixReadOnly(getComputedStyle(node).transform).m41 };
    });
    return { duration, positions };
  });
  const reference = spring({ keyframes: [0, -480], stiffness: 420, damping: 2 * Math.sqrt(420) });
  let duration = 0;
  while (!reference.next(duration).done && duration < 2000) duration += 50;
  // Motion's transform group starts its native timeline after the first render;
  // account for that elapsed fraction when comparing the original physical spring.
  for (const { ms, x } of sample.positions)
    expect(Math.abs(x - reference.next(ms + duration - sample.duration).value)).toBeLessThan(1);
  await page.evaluate(() => {
    window.StudyAnimationFixture.change({ m: 0 });
    document.querySelector<HTMLElement>('#root')!.style.width = '156px';
  });
  await expect
    .poll(() => row.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41))
    .toBe(-200);
  await page.evaluate(() => window.StudyAnimationFixture.change({ index: 5 }));
  await expect(row).toHaveCSS('transform', 'none');
});

test('a session opened beyond its first window retains the measured position', async ({ page }) => {
  await mount(page, 'segments', 1, 13);
  const row = page.locator(selectors.segments);
  expect(
    await row.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41),
  ).toBe(-480);
  await page.evaluate(async () => {
    document.querySelector<HTMLElement>('#root')!.style.width = '0';
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  expect(
    await row.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41),
  ).toBe(-480);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#root')!.style.width = '156px';
  });
  await expect
    .poll(() => row.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41))
    .toBe(-200);
});
