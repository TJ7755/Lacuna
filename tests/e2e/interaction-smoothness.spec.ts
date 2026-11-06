import { expect, test, type Locator, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { platform, arch } from 'node:os';
import sharp from 'sharp';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1440, height: 960 }, trace: 'off', video: 'off' });

const cpuRate = Number(process.env.SMOOTHNESS_CPU_RATE ?? 1);
test.beforeEach(async ({ page }) => {
  if (cpuRate > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  }
});

// Sample the whole introduction, not just DOM visibility: opacity includes ancestors,
// and readability also requires the face to have rotated back towards the reader.
async function measure(page: Page, trigger: Locator, selector: string) {
  await page.evaluate((selector) => {
    const state = window as typeof window & { smoothness?: Promise<unknown> };
    state.smoothness = new Promise((resolve) => {
      window.addEventListener(
        'click',
        () => {
          const start = performance.now();
          const frames: { ms: number; opacity: number; facing: boolean }[] = [];
          const gaps: number[] = [];
          const tasks: number[] = [];
          let nativeOpacityAnimations = 0;
          const arrivalTargets = new Set<HTMLElement>();
          let previous = start;
          const observer = new PerformanceObserver((list) => {
            tasks.push(...list.getEntries().map((entry) => entry.duration));
          });
          observer.observe({ type: 'longtask' });
          const sample = () => {
            const now = performance.now();
            gaps.push(now - previous);
            previous = now;
            const element = document.querySelector<HTMLElement>(selector);
            let opacity = element ? 1 : 0;
            let facing = true;
            for (let node = element; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              opacity *= Number(style.opacity);
              if (style.visibility === 'hidden' || style.display === 'none') opacity = 0;
              const matrix = new DOMMatrixReadOnly(style.transform);
              if (matrix.m22 < 0.9) facing = false;
            }
            nativeOpacityAnimations = Math.max(
              nativeOpacityAnimations,
              document.getAnimations().filter((animation) => {
                const effect = animation.effect;
                const arrival =
                  effect instanceof KeyframeEffect &&
                  effect.target instanceof HTMLElement &&
                  effect.target.closest('[data-page-arrival]') &&
                  effect.target.style.willChange.includes('opacity') &&
                  effect.getKeyframes().some((frame) => frame.opacity !== undefined);
                if (arrival && effect instanceof KeyframeEffect) {
                  arrivalTargets.add(effect.target as HTMLElement);
                }
                return arrival;
              }).length,
            );
            frames.push({ ms: now - start, opacity, facing });
            const readable = frames.some((frame) => frame.opacity >= 0.95 && frame.facing);
            const unsettled = [...arrivalTargets].some(
              (target) =>
                target.style.opacity !== '' || target.style.willChange.includes('opacity'),
            );
            // A cold route can finish loading after the sampling window starts.
            // Observe its complete introduction without imposing a faster cadence.
            if (now - start < 1600 || (now - start < 10_000 && (!readable || unsettled)))
              return requestAnimationFrame(sample);
            tasks.push(...observer.takeRecords().map((entry) => entry.duration));
            observer.disconnect();
            const sorted = [...gaps].sort((a, b) => a - b);
            resolve({
              firstVisibleMs: frames.find((frame) => frame.opacity > 0.05)?.ms ?? null,
              readableMs: frames.find((frame) => frame.opacity >= 0.95 && frame.facing)?.ms ?? null,
              maxFrameGapMs: Math.max(...gaps),
              p95FrameGapMs: sorted[Math.floor(sorted.length * 0.95)],
              gapsOver34Ms: gaps.filter((gap) => gap > 34).length,
              longTasks: tasks,
              nativeOpacityAnimations,
              unclearedArrivalTargets: [...arrivalTargets].filter(
                (target) =>
                  target.style.opacity !== '' || target.style.willChange.includes('opacity'),
              ).length,
            });
          };
          requestAnimationFrame(sample);
        },
        { capture: true, once: true },
      );
    });
  }, selector);
  await trigger.click();
  return page.evaluate(async () => {
    const state = window as typeof window & {
      smoothness?: Promise<{
        firstVisibleMs: number | null;
        readableMs: number | null;
        maxFrameGapMs: number;
        p95FrameGapMs: number;
        gapsOver34Ms: number;
        longTasks: number[];
        nativeOpacityAnimations: number;
        unclearedArrivalTargets: number;
      }>;
    };
    return (await state.smoothness)!;
  });
}

test('page arrivals use browser opacity animations and leave the settled surface intact', async ({
  page,
}, info) => {
  await enterFreshLacuna(page);
  const arrival = await measure(
    page,
    page.getByRole('link', { name: 'Settings', exact: true }),
    '[data-route-content="/settings"] h1',
  );
  await info.attach('page-arrival.json', {
    body: JSON.stringify(
      { os: platform(), arch: arch(), cpuRate, viewport: page.viewportSize(), arrival },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect(arrival.nativeOpacityAnimations).toBeGreaterThan(0);
  expect(arrival.readableMs).not.toBeNull();
  expect(arrival.unclearedArrivalTargets).toBe(0);
});

test('interrupting an arrival restores its CSS opacity without a queued animation render', async ({
  page,
}) => {
  await page.goto('/');
  const bundle = await build({
    entryPoints: ['apps/web/src/components/ui/PageArrival.tsx'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'ArrivalFixture',
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const root = document.createElement('div');
    root.dataset.pageArrival = '';
    const part = document.createElement('div');
    // Inferred surfaces matter too: no explicit data-page-part marker.
    part.textContent = 'Reading surface';
    part.style.willChange = 'transform';
    const css = document.createElement('style');
    css.textContent = '.arrival-probe { opacity: 0.65 }';
    part.className = 'arrival-probe';
    document.head.append(css);
    root.append(part);
    document.body.append(root);
    try {
      const fixture = window as unknown as {
        ArrivalFixture: {
          revealPageParts(root: HTMLElement, multiplier: number): (() => void) | undefined;
        };
      };
      const stop = fixture.ArrivalFixture.revealPageParts(root, 1);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const running = part.getAnimations().length;
      stop?.();
      // Wait beyond Motion's next render and the original animation endpoint.
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        running,
        opacity: part.style.opacity,
        computed: getComputedStyle(part).opacity,
        willChange: part.style.willChange,
        remaining: part.getAnimations().length,
      };
    } finally {
      root.remove();
      css.remove();
    }
  });
  expect(result).toEqual({
    running: 1,
    opacity: '',
    computed: '0.65',
    willChange: 'transform',
    remaining: 0,
  });
});

test('page opacity keeps progressing on the compositor while the main thread is busy', async ({
  page,
}, info) => {
  // Isolate animation rendering from application load and Playwright selector work.
  await page.setViewportSize({ width: 400, height: 300 });
  await page.setContent(
    '<style>body{margin:0;background:white}#part{width:400px;height:300px;background:black}</style><div data-page-arrival id="root"><div id="part" data-page-part></div></div>',
  );
  const bundle = await build({
    entryPoints: ['apps/web/src/components/ui/PageArrival.tsx'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'ArrivalFixture',
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const cdp = await page.context().newCDPSession(page);
  const frames: { timestamp: number; data: string }[] = [];
  cdp.on('Page.screencastFrame', (event) => {
    frames.push({ timestamp: event.metadata.timestamp, data: event.data });
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
  });
  let blockedAt: number;
  let releasedAt: number;
  try {
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    ({ blockedAt, releasedAt } = await page.evaluate(async () => {
      const fixture = window as unknown as {
        ArrivalFixture: { revealPageParts(root: HTMLElement, multiplier: number): unknown };
      };
      fixture.ArrivalFixture.revealPageParts(document.querySelector<HTMLElement>('#root')!, 1);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const blockedAt = Date.now();
      const start = performance.now();
      // Deliberately block JS after the first paint. rAF measurements alone cannot
      // tell a frozen main-thread fade from one still running on the compositor.
      while (performance.now() - start < 240) {
        /* controlled rendering probe */
      }
      const releasedAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { blockedAt, releasedAt };
    }));
  } finally {
    await cdp.send('Page.stopScreencast');
  }
  const samples = await Promise.all(
    frames.map(async (frame) => {
      const pixel = await sharp(Buffer.from(frame.data, 'base64'))
        .extract({ left: 200, top: 150, width: 1, height: 1 })
        .raw()
        .toBuffer();
      return { ms: frame.timestamp * 1000 - blockedAt, opacity: 1 - pixel[0] / 255 };
    }),
  );
  const duringBlock = samples.filter(
    (sample) => sample.ms > 0 && sample.ms < releasedAt - blockedAt,
  );
  await info.attach('compositor-smoothness.json', {
    body: JSON.stringify({ blockDurationMs: releasedAt - blockedAt, samples }, null, 2),
    contentType: 'application/json',
  });
  // The original numeric onUpdate animation produces no new pixels during this
  // interval. Require several distinct intermediate paints, not a final jump.
  expect(new Set(duringBlock.map((sample) => sample.opacity)).size).toBeGreaterThanOrEqual(4);
  expect(duringBlock.some((sample) => sample.opacity > 0.2 && sample.opacity < 0.9)).toBe(true);
});
