import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import type { createFeedbackSurface } from '../../apps/web/src/components/ui/flowFeedbackSurface';

declare global {
  interface Window {
    feedback: ReturnType<typeof createFeedbackSurface>;
    FeedbackFixture: { createFeedbackSurface: typeof createFeedbackSurface };
    feedbackDisposals: number;
  }
}

let script: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('../..', import.meta.url)),
      contents:
        'export { createFeedbackSurface } from "./apps/web/src/components/ui/flowFeedbackSurface";',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'FeedbackFixture',
  });
  script = result.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/__feedback-smoothness', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><button>Study</button>',
    }),
  );
  await page.goto('/__feedback-smoothness');
  await page.addScriptTag({ content: script });
  await page.evaluate(() => {
    localStorage.setItem('lacuna.motionSpeed', 'normal');
    window.feedbackDisposals = 0;
    window.feedback = window.FeedbackFixture.createFeedbackSurface(
      document.querySelector('button')!,
      () => window.feedbackDisposals++,
    );
  });
});

test('native hover, press and release keep their timing and presented opacity', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>('.flow-feedback-layer')!;
    window.feedback.retarget(false, true);
    const first = layer.getAnimations()[0];
    const timing = first.effect!.getTiming();
    const continuities = [];
    for (const [pressed, hovered] of [
      [true, true],
      [false, true],
      [false, false],
    ]) {
      layer.getAnimations()[0].currentTime = 40;
      const presented = Number(getComputedStyle(layer).opacity);
      window.feedback.retarget(pressed, hovered);
      const frames = (layer.getAnimations()[0].effect as KeyframeEffect).getKeyframes();
      continuities.push({ presented, from: Number(frames[0].opacity) });
    }
    return { timing, continuities };
  });
  expect(result.timing.duration).toBe(160);
  expect(result.timing.easing).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  for (const { presented, from } of result.continuities) {
    expect(presented).toBeGreaterThan(0);
    expect(from).toBeCloseTo(presented, 5);
  }
  await expect(page.locator('.flow-feedback-layer')).toHaveCount(0);
  expect(await page.evaluate(() => window.feedbackDisposals)).toBe(1);
});

for (const mode of ['hover', 'press'] as const) {
  test(`${mode} mode resets to its resting state without stale animation writes`, async ({
    page,
  }) => {
    await page.evaluate((mode) => {
      document.querySelector('button')!.dataset.flowFeedback = mode;
      window.feedback.retarget(true, true);
    }, mode);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.feedback.reset());
    const layer = page.locator('.flow-feedback-layer');
    await expect(layer).toHaveCSS('opacity', mode === 'hover' ? '0.045' : '0.09');
    expect(await layer.evaluate((node) => node.getAnimations().length)).toBe(0);
    await page.waitForTimeout(200);
    await expect(layer).toHaveCSS('opacity', mode === 'hover' ? '0.045' : '0.09');
    await page.evaluate(() => window.feedback.retarget(false, false));
    await expect(layer).toHaveCount(0);
  });
}

test('disposal cancels native work and restores the original positioning', async ({ page }) => {
  const result = await page.evaluate(() => {
    const button = document.querySelector('button')!;
    window.feedback.retarget(true, true);
    const layer = button.querySelector<HTMLElement>('.flow-feedback-layer')!;
    window.feedback.dispose();
    window.feedback.dispose();
    window.feedback.reset();
    window.feedback.retarget(false, true);
    return {
      connected: layer.isConnected,
      animations: layer.getAnimations().length,
      position: button.style.position,
      disposals: window.feedbackDisposals,
    };
  });
  expect(result).toEqual({ connected: false, animations: 0, position: '', disposals: 1 });
});
