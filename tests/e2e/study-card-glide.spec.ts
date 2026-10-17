import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { chooseScheduledStudy, createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ hasTouch: true });

const capture = process.env.GLIDE_CAPTURE;
const artefacts = resolve('artifacts/study-card-glide');

async function startStudy(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterFreshLacuna(page);
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
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
}

async function saveTrace(session: CDPSession, path: string) {
  const complete = new Promise<string>((done) =>
    session.once('Tracing.tracingComplete', ({ stream }) => done(stream!)),
  );
  await session.send('Tracing.end');
  const stream = await complete;
  let trace = '';
  for (;;) {
    const chunk = await session.send('IO.read', { handle: stream });
    trace += chunk.data;
    if (chunk.eof) break;
  }
  await session.send('IO.close', { handle: stream });
  await writeFile(path, trace);
  const events = JSON.parse(trace).traceEvents as { name: string; args: { snapshot?: string } }[];
  let frame = 0;
  for (const event of events) {
    if (event.name === 'Screenshot' && event.args.snapshot) {
      await writeFile(
        path.replace('-trace.json', `-frame-${String(frame++).padStart(3, '0')}.jpg`),
        Buffer.from(event.args.snapshot, 'base64'),
      );
    }
  }
}

test('first and second grades translate and rotate together from the first moving frame', async ({
  page,
}) => {
  await startStudy(page);
  const session = await page.context().newCDPSession(page);
  if (capture) {
    await mkdir(artefacts, { recursive: true });
    await session.send('Tracing.start', {
      categories:
        'devtools.timeline,v8.execute,blink.user_timing,disabled-by-default-v8.cpu_profiler,disabled-by-default-devtools.screenshot',
      transferMode: 'ReturnAsStream',
    });
  }
  const grades = [];
  try {
    for (const label of ['Yes', 'No']) {
      grades.push(
        await page.getByRole('button', { name: label, exact: true }).evaluate((button) => {
          const card = document.querySelector('[data-study-card-id]')!;
          const samples: { time: number; x: number; angle: number; opacity: number }[] = [];
          performance.mark(`study-${button.textContent?.trim()}-click`);
          const started = performance.now();
          (button as HTMLButtonElement).click();
          return new Promise<typeof samples>((done) => {
            function sample() {
              const style = getComputedStyle(card);
              const matrix = new DOMMatrixReadOnly(style.transform);
              samples.push({
                time: performance.now() - started,
                x: matrix.m41,
                angle: (Math.atan2(matrix.m12, matrix.m11) * 180) / Math.PI,
                opacity: Number(style.opacity),
              });
              if (!card.isConnected || performance.now() - started > 1800) done(samples);
              else requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
          });
        }),
      );
      await expect(page.locator('[data-study-face="back"]')).toHaveCount(0);
      if (label === 'Yes') await reveal(page);
    }
  } finally {
    if (capture) {
      await saveTrace(session, resolve(artefacts, `${capture}-trace.json`));
      await writeFile(
        resolve(artefacts, `${capture}-frames.json`),
        JSON.stringify(grades, null, 2),
      );
    }
    await session.detach();
  }
  for (const samples of grades) {
    const first = samples.find((s) => Math.abs(s.x) > 1);
    expect(first, JSON.stringify(samples)).toBeTruthy();
    expect(first!.time).toBeLessThan(100);
    expect(samples.some((s) => Math.abs(s.angle) > 0.1 && Math.abs(s.x) < 1)).toBe(false);
    const moving = samples.filter((s) => Math.abs(s.x) > 1 && s.opacity > 0.1);
    const ratios = moving.map((s) => s.angle / s.x);
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(0.001);
  }
});

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
  // Give the real study page enough content to scroll on this small viewport.
  await control
    .locator('[data-study-face]')
    .locator('..')
    .evaluate((node) => {
      (node as HTMLElement).style.minHeight = '1600px';
    });
  const session = await page.context().newCDPSession(page);
  const before = await page.evaluate(() => scrollY);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 195, y: 600 }],
  });
  for (const y of [580, 550, 510, 460]) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 195, y }],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 50);
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
