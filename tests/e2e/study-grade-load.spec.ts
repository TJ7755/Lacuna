import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

interface GradeDatabaseProbe {
  at: number;
  duration?: number;
  stores: string[];
  mode: string;
}

declare global {
  interface Window {
    gradeDatabaseProbe: GradeDatabaseProbe[];
  }
}

for (const firstLesson of [false, true]) {
  for (const gesture of [false, true]) {
    test(`grades visibly via ${gesture ? 'swipe' : 'Easy'} in ${firstLesson ? 'a new 13-card lesson' : 'a large course'}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      const bundle = await build({
        entryPoints: [
          firstLesson
            ? 'tests/e2e/fixtures/studyFirstGrade.ts'
            : 'scripts/performance-heavy/fixture.ts',
        ],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        globalName: 'StudyLoadFixture',
        define: { 'import.meta.env.DEV': 'false' },
      });
      await page.route('**/__study_fixture', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<title>Study fixture</title>' }),
      );
      await page.goto('/__study_fixture');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.evaluate(() =>
        (
          window as unknown as { StudyLoadFixture: { seed(): Promise<unknown> } }
        ).StudyLoadFixture.seed(),
      );
      const cdp = await page.context().newCDPSession(page);
      await page.addInitScript(() => {
        localStorage.setItem('lacuna.gradingMode', 'manual');
        window.gradeDatabaseProbe = [];
        const transaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (...args) {
          const tx = transaction.apply(this, args);
          const probe: GradeDatabaseProbe = {
            at: performance.now(),
            stores: Array.from(tx.objectStoreNames),
            mode: tx.mode,
          };
          window.gradeDatabaseProbe.push(probe);
          const complete = () => {
            probe.duration = performance.now() - probe.at;
          };
          tx.addEventListener('complete', complete, { once: true });
          tx.addEventListener('abort', complete, { once: true });
          return tx;
        };
      });
      await page.goto('/#/course/heavy-course-0');
      await page.getByRole('button', { name: 'Study', exact: true }).click();
      await page
        .getByRole('region', { name: 'Session preview' })
        .getByRole('button', { name: 'Start session' })
        .first()
        .click();
      await expect(page.locator('[data-study-face="front"]')).toBeVisible();
      await page
        .getByRole('button', { name: /Show answer/i })
        .last()
        .click();
      await expect(page.locator('[data-study-face="back"]')).toBeVisible();
      await page.waitForTimeout(800);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
      await page.evaluate(() => {
        const result = new Promise<number>((resolve) => {
          document.addEventListener(
            'pointerup',
            () => {
              const started = performance.now();
              performance.mark('study-grade:release');
              let visibleFrames = 0;
              function sample() {
                const face = document.querySelector<HTMLElement>('[data-study-face="front"]');
                let visible = !!face;
                if (face) {
                  const bounds = face.getBoundingClientRect();
                  visible =
                    bounds.width > 0 &&
                    bounds.height > 0 &&
                    bounds.left >= 0 &&
                    bounds.right <= innerWidth &&
                    bounds.top >= 0 &&
                    bounds.bottom <= innerHeight;
                  let opacity = 1;
                  for (let node: HTMLElement | null = face; node; node = node.parentElement) {
                    const style = getComputedStyle(node);
                    opacity *= Number(style.opacity);
                    if (style.visibility === 'hidden' || style.display === 'none' || node.inert)
                      visible = false;
                  }
                  visible &&=
                    opacity >= 0.99 &&
                    Array.from(face.querySelectorAll('img')).every(
                      (image) => image.complete && image.naturalWidth > 0,
                    );
                }
                visibleFrames = visible ? visibleFrames + 1 : 0;
                if (visibleFrames >= 2 || performance.now() - started > 10_000)
                  resolve(performance.now() - started);
                else requestAnimationFrame(sample);
              }
              requestAnimationFrame(sample);
            },
            { once: true, capture: true },
          );
        });
        (window as unknown as { gradeVisible: Promise<number> }).gradeVisible = result;
      });
      if (gesture) {
        const bounds = (await page.locator('[data-study-face="back"]').boundingBox())!;
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 400, y, { steps: 12 });
        await page.mouse.up();
      } else {
        await page.getByRole('button', { name: 'Easy', exact: true }).click();
      }
      const elapsed = await page.evaluate(
        () => (window as unknown as { gradeVisible: Promise<number> }).gradeVisible,
      );
      const database = await page.evaluate(() => ({
        release: performance.getEntriesByName('study-grade:release').at(-1)!.startTime,
        transactions: window.gradeDatabaseProbe,
      }));
      await testInfo.attach('grade-database.json', {
        body: JSON.stringify(database),
        contentType: 'application/json',
      });
      const { profile } = await cdp.send('Profiler.stop');
      await testInfo.attach('grade.cpuprofile', {
        body: JSON.stringify(profile),
        contentType: 'application/json',
      });
      await testInfo.attach('grade-time.json', {
        body: JSON.stringify({ elapsed }),
        contentType: 'application/json',
      });
      await cdp.detach();
      expect(
        database.transactions.filter(
          (transaction) =>
            transaction.mode === 'readwrite' &&
            transaction.stores.includes('assets') &&
            transaction.stores.includes('cards') &&
            transaction.at < database.release + elapsed &&
            transaction.at + (transaction.duration ?? Infinity) > database.release,
        ),
      ).toEqual([]);
      expect(elapsed).toBeLessThan(650);
    });
  }
}

interface CourseReadProbe {
  at: number;
  courseReads: number;
  historyReads: number;
}

interface KeyboardGradeSample {
  cardId: string;
  nextId: string | null;
  departureEnd: number | null;
  nextVisible: number | null;
  controlsMissingDuringBlank: boolean;
}

declare global {
  interface Window {
    courseReadProbe: CourseReadProbe[];
    keyboardGradeSample: Promise<KeyboardGradeSample>;
    StudyRapidFixture: {
      seed(): Promise<unknown>;
      snapshot(id: string): Promise<{ reps: number; reviews: number }>;
    };
  }
}

test('rapid keyboard grades avoid a blank study area and background course hydration', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const bundle = await build({
    stdin: {
      contents: `
        export { seed } from './scripts/performance-heavy/fixture';
        import { db } from './apps/web/src/db/schema';
        export async function snapshot(id) {
          await db.open();
          const card = await db.cards.get(id);
          const reviews = await db.reviewHistory.where('cardId').equals(id).count();
          return { reps: card.reps, reviews };
        }
      `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'StudyRapidFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  const fixture = bundle.outputFiles[0].text;
  await page.route('**/__study_fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Study fixture</title>' }),
  );
  await page.goto('/__study_fixture');
  await page.addScriptTag({ content: fixture });
  // The complete fixture has ten courses, 10,000 cards and 200,000 review events.
  await page.evaluate(() => window.StudyRapidFixture.seed());
  await page.addInitScript(() => {
    localStorage.setItem('lacuna.gradingMode', 'manual');
    Math.random = () => 0.5;
    window.courseReadProbe = [];
    const probes = new WeakMap<IDBTransaction, CourseReadProbe>();
    const getAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) {
      const tx = this.objectStore.transaction;
      if (tx.mode === 'readonly') {
        let probe = probes.get(tx);
        if (!probe) {
          probe = { at: performance.now(), courseReads: 0, historyReads: 0 };
          probes.set(tx, probe);
          window.courseReadProbe.push(probe);
        }
        if (this.objectStore.name === 'cards' && this.name === 'courseId') probe.courseReads += 1;
        if (this.objectStore.name === 'reviewHistory' && this.name === 'cardId')
          probe.historyReads += 1;
      }
      return getAll.apply(this, args);
    };
  });
  await page.goto('/#/course/heavy-course-0');
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page
    .getByRole('region', { name: 'Session preview' })
    .getByRole('button', { name: 'Start session' })
    .first()
    .click();
  const active = page.locator('[data-study-card-id]:not([inert])');
  await expect(active.locator('[data-study-face="front"]')).toBeVisible();
  await page.addScriptTag({ content: fixture });
  // Let entry work settle before observing reads caused by grading.
  await page.waitForTimeout(800);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const entryReads = await page.evaluate(() => window.courseReadProbe);
  expect(
    entryReads.some((probe) => probe.courseReads > 0),
    'Course-read probe is active',
  ).toBe(true);
  expect(
    entryReads.some((probe) => probe.historyReads >= 1000),
    'History fan-out probe is active',
  ).toBe(true);
  const began = await page.evaluate(() => performance.now());
  const samples: (KeyboardGradeSample & { grade: number })[] = [];
  // Measure Card advances within a block; review ten deliberately opens the hand-off.
  for (const grade of [1, 2, 1, 3, 1, 4, 1, 2, 1]) {
    const cardId = (await active.getAttribute('data-study-card-id'))!;
    const before = await page.evaluate((id) => window.StudyRapidFixture.snapshot(id), cardId);
    await page.evaluate(() => {
      window.keyboardGradeSample = new Promise((resolve) => {
        const onKey = (event: KeyboardEvent) => {
          if (!['1', '2', '3', '4'].includes(event.key)) return;
          window.removeEventListener('keydown', onKey, true);
          const outgoing = document.querySelector<HTMLElement>(
            '[data-study-card-id]:not([inert])',
          )!;
          const started = performance.now();
          const result: KeyboardGradeSample = {
            cardId: outgoing.dataset.studyCardId!,
            nextId: null,
            departureEnd: null,
            nextVisible: null,
            controlsMissingDuringBlank: false,
          };
          const visible = (element: HTMLElement) => {
            const bounds = element.getBoundingClientRect();
            let opacity = 1;
            for (let node: HTMLElement | null = element; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              opacity *= Number(style.opacity);
              if (style.visibility === 'hidden' || style.display === 'none') return false;
            }
            return (
              bounds.width > 0 &&
              bounds.height > 0 &&
              bounds.right > 0 &&
              bounds.left < innerWidth &&
              bounds.bottom > 0 &&
              bounds.top < innerHeight &&
              opacity > 0.02
            );
          };
          function sample() {
            const now = performance.now();
            const animation = outgoing
              .getAnimations()
              .find(
                (candidate) =>
                  candidate.effect instanceof KeyframeEffect &&
                  candidate.effect
                    .getKeyframes()
                    .some((frame) => String(frame.transform).includes('translateX')),
              );
            if (result.departureEnd === null && animation && animation.startTime !== null) {
              result.departureEnd =
                Number(animation.startTime) + Number(animation.effect!.getComputedTiming().endTime);
            }
            const next = document.querySelector<HTMLElement>('[data-study-card-id]:not([inert])');
            const front = next?.querySelector<HTMLElement>('[data-study-face="front"]');
            if (
              next &&
              next !== outgoing &&
              front &&
              visible(front) &&
              Array.from(front.querySelectorAll('img')).every(
                (image) => image.complete && image.naturalWidth > 0,
              )
            ) {
              result.nextId = next.dataset.studyCardId!;
              result.nextVisible = now;
            }
            if (
              result.departureEnd !== null &&
              now >= result.departureEnd &&
              result.nextVisible === null
            ) {
              const buttons = Array.from(document.querySelectorAll('button'));
              result.controlsMissingDuringBlank ||= ['Again', 'Hard', 'Good', 'Easy'].some(
                (label) =>
                  !buttons.some(
                    (button) => button.textContent?.trim() === label && visible(button),
                  ),
              );
            }
            if (result.nextVisible !== null || now - started > 10_000) resolve(result);
            else requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        };
        window.addEventListener('keydown', onKey, true);
      });
    });
    await page.keyboard.press('ArrowUp');
    // Grade before the flip and liquid controls have settled, through the real handler.
    await page.waitForTimeout(30);
    await page.keyboard.press(String(grade));
    const sample = await page.evaluate(() => window.keyboardGradeSample);
    samples.push({ ...sample, grade });
    expect(sample.nextVisible, 'Every grade must produce a visible next face').not.toBeNull();
    const after = await page.evaluate((id) => window.StudyRapidFixture.snapshot(id), cardId);
    expect(after, 'Each accepted key records exactly one review').toEqual({
      reps: before.reps + 1,
      reviews: before.reviews + 1,
    });
  }
  const reads = await page.evaluate(
    (start) => window.courseReadProbe.filter((probe) => probe.at >= start),
    began,
  );
  await testInfo.attach('rapid-keyboard-grades.json', {
    body: JSON.stringify({ cpuRate: 4, samples, reads }, null, 2),
    contentType: 'application/json',
  });
  await cdp.detach();
  // The first review may sample the daily trajectory from stored Card projections.
  // It reads the course once without hydrating history; per-grade planning must not.
  expect(
    reads.reduce((count, probe) => count + probe.courseReads, 0),
    'At most one daily trajectory projection read, never repeated course reloads',
  ).toBeLessThanOrEqual(1);
  expect(
    reads.filter((probe) => probe.historyReads >= 1000),
    'No readonly full-course history fan-out during repeated grades',
  ).toEqual([]);
  for (const sample of samples) {
    expect(
      sample.departureEnd,
      'Observe the native departure, not a guessed duration',
    ).not.toBeNull();
    expect(
      sample.controlsMissingDuringBlank,
      'All four grades remain during a blank interval',
    ).toBe(false);
    expect(sample.nextVisible! - sample.departureEnd!, JSON.stringify(sample)).toBeLessThan(650);
  }
  const last = samples.at(-1)!;
  const graded = await page.evaluate((id) => window.StudyRapidFixture.snapshot(id), last.cardId);
  await page.keyboard.press('u');
  await expect(active).toHaveAttribute('data-study-card-id', last.cardId);
  await expect
    .poll(() => page.evaluate((id) => window.StudyRapidFixture.snapshot(id), last.cardId))
    .toEqual({ reps: graded.reps - 1, reviews: graded.reviews - 1 });
});
