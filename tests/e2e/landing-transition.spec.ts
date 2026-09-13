import { expect, test } from '@playwright/test';

interface TraceEvent {
  name: string;
  ts: number;
  pid: number;
  args?: { tileData?: { layerId: number; sourceFrameNumber: number } };
}

test('app-entry expansion does not rerasterise a viewport mask every frame', async ({ page }) => {
  await page.goto('/#/welcome');
  const cta = page
    .getByRole('navigation', { name: 'Landing navigation' })
    .getByRole('link', { name: 'Open Lacuna' });
  await expect(cta).toBeVisible();
  await page.evaluate(() => {
    window.addEventListener('lacuna:landing-transition', () => performance.mark('landing-begin'));
    window.addEventListener('lacuna:landing-covered', () => performance.mark('landing-covered'));
  });
  const session = await page.context().newCDPSession(page);
  const events: TraceEvent[] = [];
  session.on('Tracing.dataCollected', ({ value }: { value: TraceEvent[] }) =>
    events.push(...value),
  );
  await session.send('Tracing.start', {
    categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,cc',
    transferMode: 'ReportEvents',
  });
  try {
    await cta.click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('[data-landing-transition]')).toHaveCount(0);
  } finally {
    const complete = new Promise<void>((resolve) =>
      session.once('Tracing.tracingComplete', () => resolve()),
    );
    await session.send('Tracing.end');
    await complete;
    await session.detach();
  }
  const begin = events.find((event) => event.name === 'landing-begin');
  const covered = events.find((event) => event.name === 'landing-covered');
  expect(begin).toBeDefined();
  expect(covered).toBeDefined();
  // Hardware-accelerated clip masks can rasterise without changing their source
  // frame number, so also reject the native paint-worklet path explicitly.
  const maskPaints = events.filter(
    (event) =>
      event.name === 'PaintWorkletPaintDispatcher::AsyncPaintDone' &&
      event.ts > begin!.ts &&
      event.ts < covered!.ts,
  );
  expect(maskPaints.length).toBeLessThanOrEqual(1);
  // Ignore setup and the initial corner rounding. Sustained raster work on one
  // layer catches both software clip painting and accelerated clip-mask painting.
  // Unlike FPS, the number of rasterised source frames is independent of CPU speed.
  const rasterFrames = new Map<string, Set<number>>();
  for (const event of events) {
    if (
      event.name !== 'RasterTask' ||
      event.ts < begin!.ts + 120_000 ||
      event.ts > covered!.ts - 30_000
    )
      continue;
    const tile = event.args?.tileData;
    if (!tile) continue;
    const key = `${event.pid}:${tile.layerId}`;
    const frames = rasterFrames.get(key) ?? new Set<number>();
    frames.add(tile.sourceFrameNumber);
    rasterFrames.set(key, frames);
  }
  expect(
    Math.max(0, ...[...rasterFrames.values()].map((frames) => frames.size)),
  ).toBeLessThanOrEqual(2);
});

for (const label of ['Start revising', 'Open Lacuna']) {
  test(`${label} launches promptly while preserving the continuous cover`, async ({ page }) => {
    await page.goto('/#/welcome');
    await page.evaluate(() => {
      const samples: { phase: string; duration: number; quarterWidth: number; viewport: number }[] = [];
      Object.assign(window, { launchSamples: samples });
      let covered = false;
      window.addEventListener('lacuna:landing-covered', () => { covered = true; });
      window.addEventListener('lacuna:landing-transition', () => {
        const sample = () => {
          const surface = document.querySelector('[data-landing-transition] > div');
          const animation = surface?.getAnimations().find((entry) =>
            (entry.effect as KeyframeEffect).getKeyframes().some((frame) => frame.transform),
          );
          const phase = covered ? 'reveal' : 'cover';
          if (animation && !samples.some((entry) => entry.phase === phase)) {
            const duration = Number(animation.effect!.getTiming().duration);
            const previous = animation.currentTime;
            animation.currentTime = duration / 4;
            const quarterWidth = surface!.getBoundingClientRect().width;
            animation.currentTime = previous;
            samples.push({ phase, duration, quarterWidth, viewport: innerWidth });
          }
          if (samples.length < 2) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }, { once: true });
    });
    await page.getByRole('link', { name: label, exact: true }).first().click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('[data-landing-transition]')).toHaveCount(0);
    const samples = await page.evaluate(() => (window as unknown as {
      launchSamples: { phase: string; duration: number; quarterWidth: number; viewport: number }[];
    }).launchSamples);
    expect(samples.map((sample) => sample.phase)).toEqual(['cover', 'reveal']);
    expect(samples[0].duration).toBeLessThanOrEqual(260);
    expect(samples[1].duration).toBeLessThanOrEqual(260);
    // The expansion has already covered most of the width at its first quarter,
    // rather than spending the first half of the transition winding up.
    expect(samples[0].quarterWidth / samples[0].viewport).toBeGreaterThan(0.6);
  });
}

test('the launch cover replaces the outgoing landing fade', async ({ page }) => {
  await page.goto('/#/welcome');
  await page.evaluate(() => {
    Object.assign(window, { landingFadeDuringReveal: false });
    window.addEventListener('lacuna:landing-covered', () => {
      const inspect = () => {
        if (!document.querySelector('[data-landing-transition]')) return;
        let ancestor = document.querySelector('.landing-preview')?.parentElement;
        while (ancestor) {
          const fading = ancestor.getAnimations().some((animation) =>
            Number(animation.effect?.getTiming().duration) > 0 &&
            (animation.effect as KeyframeEffect).getKeyframes().some((frame) => frame.opacity === '0'),
          );
          if (fading) Object.assign(window, { landingFadeDuringReveal: true });
          ancestor = ancestor.parentElement;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    }, { once: true });
  });
  await page.getByRole('link', { name: 'Start revising', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('[data-landing-transition]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as {
    landingFadeDuringReveal: boolean;
  }).landingFadeDuringReveal)).toBe(false);
});
