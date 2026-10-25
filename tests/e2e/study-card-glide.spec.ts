import { expect, test, type Page } from '@playwright/test';
import { chooseScheduledStudy, createCourse, skipOnboarding } from './fixtures/lacunaApp';

test.use({ hasTouch: true });

async function startStudy(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await skipOnboarding(page);
  await createCourse(page, 'Card glide');
  await page.getByRole('button', { name: 'Edit mode' }).click();
  for (const front of ['Glide one', 'Glide two', 'Glide three']) {
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Front' }).fill(front);
    await page.getByRole('textbox', { name: 'Back' }).fill('Glide answer');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page).not.toHaveURL(/\/cards\/new$/);
  }
  await page
    .getByRole('navigation', { name: 'Course sections' })
    .getByRole('link', { name: 'Path', exact: true })
    .click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await chooseScheduledStudy(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await reveal(page);
}

async function reveal(page: Page) {
  await expect(page.locator('[data-study-face="front"]')).toBeVisible();
  await page
    .getByRole('button', { name: /Show answer/i })
    .last()
    .click();
  await expect(page.locator('[data-study-face="back"]')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('[data-study-face="back"]')
        .locator('..')
        .evaluate((node) => getComputedStyle(node).opacity),
    )
    .toBe('1');
}

test('touch drag follows the finger, cancels and commits without a hand-off pause', async ({
  page,
}) => {
  await startStudy(page);
  const session = await page.context().newCDPSession(page);
  const control = page
    .getByRole('button', { name: 'Hide answer', exact: true })
    .filter({ has: page.locator('[data-study-face]') });
  const surface = (await control.locator('[data-study-face]').locator('..').elementHandle())!;
  const box = (await control.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', dx = 0, dy = 0) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: x + dx, y: y + dy }],
    });
  const centre = () =>
    surface.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.x + box.width / 2;
    });
  const origin = await centre();
  await touch('touchStart');
  await touch('touchMove', 35);
  await expect.poll(async () => Math.abs((await centre()) - origin - 35)).toBeLessThan(1);
  // A held short drag must cancel rather than flick. Real CDP touch honours pan-y.
  await page.waitForTimeout(150);
  await touch('touchEnd');
  await expect.poll(async () => Math.abs((await centre()) - origin)).toBeLessThan(1);
  await expect(control).toBeVisible();
  await touch('touchStart');
  await touch('touchMove', -100);
  await expect.poll(async () => Math.abs((await centre()) - origin + 100)).toBeLessThan(1);
  await touch('touchCancel');
  await expect.poll(async () => Math.abs((await centre()) - origin)).toBeLessThan(1);
  await expect(control).toBeVisible();
  await touch('touchStart');
  await touch('touchMove', 100);
  const release = await surface.evaluateHandle((node) => {
    const finished = new Promise<{ time: number; centre: number }[]>((done) => {
      window.addEventListener(
        'pointerup',
        () => {
          const started = performance.now();
          const frames: { time: number; centre: number }[] = [];
          function sample() {
            const box = node.getBoundingClientRect();
            frames.push({ time: performance.now() - started, centre: box.x + box.width / 2 });
            if (performance.now() - started > 100) done(frames);
            else requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        },
        { once: true, capture: true },
      );
    });
    return { finished };
  });
  await touch('touchEnd');
  const frames = await release.evaluate((result) => result.finished);
  await release.dispose();
  expect(
    frames.some((frame) => frame.time < 60 && frame.centre > origin + 102),
    JSON.stringify(frames),
  ).toBe(true);
  await expect(control).toHaveCount(0);
  await expect(page.locator('[data-study-face="front"]')).toBeVisible();
  await session.detach();
});

test('vertical touch scrolling leaves the answer ungraded', async ({ page }) => {
  await startStudy(page);
  const control = page
    .getByRole('button', { name: 'Hide answer', exact: true })
    .filter({ has: page.locator('[data-study-face]') });
  // The session fills the viewport, so the answer face is the vertical scroller.
  // Give it more content than fits on this small viewport.
  const face = page.locator('[data-study-face="back"]');
  await face.evaluate((node) => {
    const spacer = document.createElement('div');
    spacer.style.height = '1600px';
    spacer.style.flexShrink = '0';
    node.append(spacer);
  });
  const session = await page.context().newCDPSession(page);
  const scrolled = () => face.evaluate((node) => node.scrollTop);
  const before = await scrolled();
  // Start low on the face so the upward drag has a full gesture's travel.
  const box = (await face.boundingBox())!;
  const x = box.x + box.width / 2;
  const start = box.y + box.height - 12;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: start }],
  });
  for (const travel of [20, 50, 90, 140]) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: start - travel }],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(scrolled).toBeGreaterThan(before + 50);
  await expect(control).toHaveCount(1);
  await expect(page.locator('[data-study-face="back"]')).toHaveCount(1);
  await expect(page.locator('[data-study-card-id]')).toHaveCSS('transform', 'none');
  await session.detach();
});

test('first grade starts departing while write completion is delayed', async ({ page }) => {
  await startStudy(page);
  const card = (await page.locator('[data-study-card-id]').elementHandle())!;
  const cardId = await card.getAttribute('data-study-card-id');
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!;
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      ...descriptor,
      set(listener: ((event: Event) => void) | null) {
        descriptor.set!.call(
          this,
          listener &&
            ((event: Event) => {
              if (this.mode === 'readwrite') setTimeout(() => listener.call(this, event), 900);
              else listener.call(this, event);
            }),
        );
      },
    });
  });
  await page
    .getByRole('button', { name: 'Yes', exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect
    .poll(
      () => card.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41),
      {
        timeout: 200,
        intervals: [10],
      },
    )
    .toBeGreaterThan(20);
  await expect(page.locator('[data-study-face="front"]')).toHaveCount(0);
  await expect(page.locator('[data-study-face="front"]')).toBeVisible();
  const count = await page.evaluate(
    (id) =>
      new Promise<number>((done, fail) => {
        const open = indexedDB.open('lacuna');
        open.onerror = () => fail(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const query = db
            .transaction('reviewHistory')
            .objectStore('reviewHistory')
            .index('cardId')
            .count(id!);
          query.onsuccess = () => {
            db.close();
            done(query.result);
          };
          query.onerror = () => {
            db.close();
            fail(query.error);
          };
        };
      }),
    cardId,
  );
  expect(count).toBe(1);
});

test('profiles the Yes transition without changing its visuals', async ({ page }, testInfo) => {
  await startStudy(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(800);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const events: { name: string; dur?: number; ts: number; args?: unknown }[] = [];
  cdp.on('Tracing.dataCollected', ({ value }) =>
    events.push(...(value as unknown as typeof events)),
  );
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline',
    transferMode: 'ReportEvents',
  });
  const frames = await page.getByRole('button', { name: 'Yes', exact: true }).evaluate(
    (button) =>
      new Promise<{ times: number[]; nativeFlight: boolean }>((resolve) => {
        const started = performance.now();
        const times: number[] = [];
        let nativeFlight = false;
        (button as HTMLButtonElement).click();
        const sample = () => {
          times.push(performance.now() - started);
          nativeFlight ||= document.getAnimations().some((animation) => {
            const effect = animation.effect;
            return (
              effect instanceof KeyframeEffect &&
              effect.target instanceof Element &&
              effect.target.matches('[data-study-card-id]') &&
              effect
                .getKeyframes()
                .some((keyframe) => String(keyframe.transform).includes('translateX'))
            );
          });
          if (performance.now() - started < 900) requestAnimationFrame(sample);
          else resolve({ times, nativeFlight });
        };
        requestAnimationFrame(sample);
      }),
  );
  const complete = new Promise<void>((resolve) =>
    cdp.once('Tracing.tracingComplete', () => resolve()),
  );
  await cdp.send('Tracing.end');
  await complete;
  const summary = Object.fromEntries(
    ['Layout', 'Paint', 'UpdateLayoutTree', 'FireAnimationFrame'].map((name) => {
      const matching = events.filter((event) => event.name === name);
      return [
        name,
        {
          count: matching.length,
          ms: matching.reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000,
        },
      ];
    }),
  );
  const gaps = frames.times.slice(1).map((time, i) => time - frames.times[i]);
  await testInfo.attach('grade-timeline.json', {
    body: JSON.stringify({ summary, frames, worstGap: Math.max(...gaps), events }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath('after-yes.png') });
  await cdp.detach();
  // The grade liquid is SVG, whose geometry relayouts its own small subtree once in each
  // frame it moves (about 60 here); guard against thrash and real cost rather than that.
  expect(summary.Layout.count).toBeLessThan(90);
  expect(summary.Layout.ms).toBeLessThan(60);
  expect(frames.nativeFlight).toBe(true);
});
