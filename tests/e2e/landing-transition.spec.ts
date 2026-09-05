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
      event.ts < begin!.ts + 200_000 ||
      event.ts > covered!.ts - 50_000
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
