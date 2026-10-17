import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { chooseScheduledStudy, createCourse } from './fixtures/lacunaApp';

test.use({ hasTouch: true });

const capture = process.env.GLIDE_CAPTURE;
const artefacts = resolve('artifacts/study-card-glide');

async function startStudy(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
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

test('paced exit tempo captures accelerating departures and overlapping arrivals', async ({
  page,
}) => {
  await startStudy(page);
  const directory = resolve('artifacts/study-card-exit-tempo');
  await mkdir(directory, { recursive: true });
  const session = await page.context().newCDPSession(page);
  const screenshots: { time: number; data: string }[] = [];
  session.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    screenshots.push({ time: (metadata.timestamp ?? 0) * 1000, data });
    void session.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', { format: 'png', maxWidth: 390, maxHeight: 900 });
  const results = [];
  try {
    for (const input of ['button', 'touch'] as const) {
      const card = (await page.locator('[data-study-card-id]:not([inert])').elementHandle())!;
      const measurement = await card.evaluateHandle((node, input) => {
        type Frame = {
          time: number;
          x: number;
          angle: number;
          left: number;
          incomingY: number | null;
        };
        let started: number | null = null;
        let startX = 0;
        let offscreenAt: number | null = null;
        let incomingStartedAt: number | null = null;
        let incomingSettledAt: number | null = null;
        const incomingFrames: { time: number; y: number; scale: number }[] = [];
        const frames: Frame[] = [];
        const moves: { time: number; x: number }[] = [];
        const onMove = (event: PointerEvent) =>
          moves.push({ time: performance.now(), x: event.clientX });
        window.addEventListener('pointermove', onMove, true);
        const finished = new Promise<{
          started: number;
          startX: number;
          offscreenAt: number | null;
          incomingStartedAt: number | null;
          incomingSettledAt: number | null;
          incomingFrames: { time: number; y: number; scale: number }[];
          frames: Frame[];
          moves: { time: number; x: number }[];
        }>((done) => {
          window.addEventListener(
            input === 'button' ? 'click' : 'pointerup',
            () => {
              started = performance.now();
              startX = new DOMMatrixReadOnly(getComputedStyle(node).transform).m41;
              frames.push({
                time: 0,
                x: startX,
                angle: startX / 160,
                left: node.getBoundingClientRect().left,
                incomingY: null,
              });
            },
            { once: true, capture: true },
          );
          function sample() {
            if (started !== null) {
              const time = performance.now() - started;
              const incoming = document.querySelector('[data-study-card-id]:not([inert])');
              let incomingY: number | null = null;
              if (incoming && incoming !== node) {
                incomingStartedAt ??= time;
                const style = getComputedStyle(incoming);
                const matrix = new DOMMatrixReadOnly(style.transform);
                incomingY = matrix.m42;
                const elapsed = time - incomingStartedAt;
                incomingFrames.push({ time: elapsed, y: incomingY, scale: matrix.m11 });
                if (style.transform === 'none') incomingSettledAt ??= elapsed;
              }
              if (node.isConnected) {
                const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
                const left = node.getBoundingClientRect().left;
                if (left >= innerWidth && offscreenAt === null) offscreenAt = time;
                frames.push({
                  time,
                  x: matrix.m41,
                  angle: (Math.atan2(matrix.m12, matrix.m11) * 180) / Math.PI,
                  left,
                  incomingY,
                });
              }
              if ((!node.isConnected && incomingSettledAt !== null) || time > 1400) {
                window.removeEventListener('pointermove', onMove, true);
                done({
                  started: performance.timeOrigin + started,
                  startX,
                  offscreenAt,
                  incomingStartedAt,
                  incomingSettledAt,
                  incomingFrames,
                  frames,
                  moves,
                });
                return;
              }
            }
            requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        });
        return { finished };
      }, input);
      if (input === 'button') {
        await page
          .getByRole('button', { name: 'Yes', exact: true })
          .evaluate((button) => (button as HTMLButtonElement).click());
      } else {
        await card.evaluate(async (node) => {
          const control = node.querySelector<HTMLElement>('[role="button"]')!;
          const box = control.getBoundingClientRect();
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          const capture = control.setPointerCapture;
          const release = control.releasePointerCapture;
          // Synthetic touch pointers have no native capture session. This isolates
          // release physics from the browser's scroll gesture arbitration.
          control.setPointerCapture = () => {};
          control.releasePointerCapture = () => {};
          const send = (type: string, dx: number) =>
            control.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                pointerId: 1,
                pointerType: 'touch',
                isPrimary: true,
                clientX: x + dx,
                clientY: y,
              }),
            );
          try {
            send('pointerdown', 0);
            for (const dx of [20, 40, 60, 80]) {
              send('pointermove', dx);
              await new Promise(requestAnimationFrame);
            }
            send('pointerup', 80);
          } finally {
            control.setPointerCapture = capture;
            control.releasePointerCapture = release;
          }
        });
      }
      const result = { input, ...(await measurement.evaluate((value) => value.finished)) };
      results.push(result);
      await writeFile(resolve(directory, 'curves.json'), JSON.stringify(results, null, 2));
      await measurement.dispose();
      if (input === 'button') {
        await expect
          .poll(() =>
            page
              .locator('[data-study-card-id]:not([inert])')
              .evaluate((node) =>
                Math.abs(new DOMMatrixReadOnly(getComputedStyle(node).transform).m42),
              ),
          )
          .toBeLessThan(0.1);
        await reveal(page);
      }
    }
  } finally {
    await writeFile(resolve(directory, 'curves.json'), JSON.stringify(results, null, 2));
    await session.send('Page.stopScreencast').catch(() => {});
    await session.detach().catch(() => {});
  }
  for (const result of results) {
    for (const time of result.input === 'button' ? [60, 240] : [40, 160]) {
      const frame = screenshots.reduce((a, b) =>
        Math.abs(a.time - result.started - time) < Math.abs(b.time - result.started - time) ? a : b,
      );
      await writeFile(
        resolve(directory, `${result.input}-${time}ms.png`),
        Buffer.from(frame.data, 'base64'),
      );
    }
  }
  for (const result of results) {
    expect(result.offscreenAt).not.toBeNull();
    expect(result.offscreenAt!).toBeGreaterThan(result.input === 'button' ? 300 : 100);
    expect(result.offscreenAt!).toBeLessThan(result.input === 'button' ? 340 : 280);
    expect(result.incomingStartedAt).not.toBeNull();
    expect(result.incomingStartedAt!).toBeLessThan(result.offscreenAt!);
    expect(result.incomingSettledAt).not.toBeNull();
    expect(result.incomingSettledAt!).toBeLessThan(320);
    expect(result.incomingFrames.every((frame) => frame.y >= -0.01 && frame.scale <= 1.0001)).toBe(
      true,
    );
    const position = (time: number) =>
      result.frames.reduce((a, b) => (Math.abs(a.time - time) < Math.abs(b.time - time) ? a : b)).x;
    if (result.input === 'button') {
      expect(position(60)).toBeGreaterThan(4);
      expect(position(200) - position(100)).toBeGreaterThan(position(100) * 2);
      expect(position(300) - position(200)).toBeGreaterThan(position(200) - position(100));
      expect(result.frames.find((frame) => frame.x > 1)!.time).toBeLessThan(100);
    } else {
      expect(result.startX).toBeGreaterThan(60);
      expect(position(50)).toBeGreaterThan(result.startX + 20);
    }
  }
});
