import { expect, test, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

async function sample(panel: Locator, start: number) {
  return panel.evaluate((panel, start) => {
    const sidebar = panel.closest('aside')!;
    const archived = sidebar.querySelector('[aria-label="Archived"]')!;
    const sibling = sidebar.querySelector('[aria-label="Biology"]')!;
    const rows = [...panel.querySelectorAll('a')].map((row) => row.parentElement!);
    const chevron = sidebar.querySelector('[aria-controls] > span')!;
    return {
      ms: Math.round(performance.now() - start),
      px: panel.getBoundingClientRect().height,
      siblingY: sibling.getBoundingClientRect().y,
      archivedY: archived.getBoundingClientRect().y,
      panelOpacity: Number(getComputedStyle(panel).opacity),
      archivedOpacity: Number(getComputedStyle(archived).opacity),
      rowOpacities: rows.map((row) => Number(getComputedStyle(row).opacity)),
      rowY: rows.map((row) => new DOMMatrix(getComputedStyle(row).transform).f),
      chevron:
        (Math.atan2(
          new DOMMatrix(getComputedStyle(chevron).transform).b,
          new DOMMatrix(getComputedStyle(chevron).transform).a,
        ) *
          180) /
        Math.PI,
    };
  }, start);
}

async function toggle(panel: Locator) {
  await panel.evaluate((panel) => {
    const button = [...panel.closest('aside')!.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-controls') === panel.id,
    )!;
    button.click();
  });
}

async function curve(page: Page, panel: Locator, name?: string) {
  const start = await page.evaluate(() => performance.now());
  const samples = [await sample(panel, start)];
  await toggle(panel);
  for (const time of [16, 32, 64, 100, 150, 200, 250, 300, 400, 500, 650]) {
    const elapsed = await page.evaluate((start) => performance.now() - start, start);
    if (elapsed < time) await page.waitForTimeout(time - elapsed);
    const frame = await sample(panel, start);
    samples.push(frame);
    if (name && [64, 150, 250].includes(time)) {
      await page.screenshot({ path: test.info().outputPath(`${name}-${frame.ms}ms.png`) });
    }
  }
  return samples;
}

function checkFlow(samples: Awaited<ReturnType<typeof curve>>, opening: boolean) {
  const first = samples[0];
  for (const [index, frame] of samples.entries()) {
    expect.soft(Math.abs(frame.siblingY - first.siblingY - frame.px + first.px)).toBeLessThan(0.6);
    expect
      .soft(Math.abs(frame.archivedY - first.archivedY - frame.px + first.px))
      .toBeLessThan(0.6);
    expect.soft(frame.panelOpacity).toBe(1);
    expect.soft(frame.archivedOpacity).toBe(1);
    if (index) {
      const delta = frame.px - samples[index - 1].px;
      expect.soft(opening ? delta : -delta).toBeGreaterThanOrEqual(-0.1);
    }
  }
  expect.soft(samples.some((frame) => frame.px > 1 && frame.px < 131)).toBe(true);
  expect.soft(samples.at(-1)!.px).toBe(opening ? 132 : 0);
  expect.soft(Math.abs(samples.at(-1)!.chevron - (opening ? 0 : -90))).toBeLessThan(0.5);
}

test('course height, lesson stagger and following rows share reversible motion', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(
            ['courses', 'lessons', 'courseAssessments'],
            'readwrite',
          );
          const courses = transaction.objectStore('courses');
          const lessons = transaction.objectStore('lessons');
          const assessments = transaction.objectStore('courseAssessments');
          const assessmentRequest = assessments.getAll();
          assessmentRequest.onsuccess = () => {
            const final = assessmentRequest.result.find(
              (assessment) => assessment.kind === 'final',
            );
            for (const index of [0, 1]) {
              assessments.put({
                ...final,
                id: `motion-final-${index}`,
                courseId: `motion-${index}`,
              });
            }
          };
          const courseRequest = courses.getAll();
          courseRequest.onsuccess = () => {
            const original = courseRequest.result[0];
            courses.put({ ...original, name: 'History' });
            for (const [index, name] of ['Biology', 'Chemistry'].entries()) {
              courses.put({
                ...original,
                id: `motion-${index}`,
                name,
                createdAt: original.createdAt + index + 1,
              });
            }
            const lessonRequest = lessons.getAll();
            lessonRequest.onsuccess = () => {
              const titles = [
                'Was the Treaty of Versailles fair?',
                'To what extent was the League successful?',
                "Hitler's foreign policy",
              ];
              lessonRequest.result
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .forEach((lesson, i) => {
                  if (i < 3) lessons.put({ ...lesson, name: titles[i] });
                  else lessons.delete(lesson.id);
                });
            };
          };
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
  );
  await page.reload();
  const history = page.getByRole('button', { name: 'Expand History', exact: true });
  await expect(history).toBeVisible();
  await page.waitForTimeout(900);
  const panel = page.locator(`[id="${await history.getAttribute('aria-controls')}"]`);
  const evidence: Record<string, unknown> = {};

  for (const theme of ['dark', 'light']) {
    if (theme === 'light') {
      await page
        .getByRole('button', { name: 'Toggle colour theme' })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await page.waitForTimeout(32);
    }
    const open = await curve(page, panel, `${theme}-open`);
    const close = await curve(page, panel, `${theme}-close`);
    evidence[theme] = { open, close };
    checkFlow(open, true);
    checkFlow(close, false);
    expect
      .soft(open.find((frame) => frame.ms >= 64)!.rowOpacities[0])
      .toBeGreaterThan(open.find((frame) => frame.ms >= 64)!.rowOpacities[2]);
    expect
      .soft(close.find((frame) => frame.ms >= 32)!.rowOpacities[0])
      .toBeGreaterThan(close.find((frame) => frame.ms >= 32)!.rowOpacities[2]);
    const settled = (frames: typeof open, target: number) =>
      frames.find((frame) => Math.abs(frame.px - target) < 1)!.ms;
    expect.soft(settled(close, 0)).toBeLessThan(settled(open, 132));
  }

  const reversals = [];
  for (const elapsed of [80, 60, 100, 60]) {
    const before = await sample(panel, 0);
    const discontinuity = await panel.evaluate((panel) => {
      const before = panel.getBoundingClientRect().height;
      const button = [...panel.closest('aside')!.querySelectorAll('button')].find(
        (button) => button.getAttribute('aria-controls') === panel.id,
      )!;
      button.click();
      return panel.getBoundingClientRect().height - before;
    });
    const after = await sample(panel, 0);
    expect.soft(discontinuity).toBe(0);
    await page.waitForTimeout(elapsed);
    reversals.push({ before, after, next: await sample(panel, 0) });
  }
  evidence.reversals = reversals;
  await page.waitForTimeout(700);

  const speeds = [];
  for (const speed of ['fast', 'normal', 'slow']) {
    await page.evaluate((speed) => {
      localStorage.setItem('lacuna.motionSpeed', speed);
      dispatchEvent(new CustomEvent('lacuna:motion-speed', { detail: speed }));
    }, speed);
    await page.waitForTimeout(32);
    await toggle(panel);
    await page.waitForTimeout(100);
    const height = (await sample(panel, 0)).px;
    speeds.push({ speed, heightAt100ms: height });
    await page.waitForTimeout(1000);
    await toggle(panel);
    await page.waitForTimeout(1000);
  }
  evidence.speeds = speeds;
  expect.soft(speeds[0].heightAt100ms).toBeGreaterThan(speeds[1].heightAt100ms);
  expect.soft(speeds[1].heightAt100ms).toBeGreaterThan(speeds[2].heightAt100ms);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(32);
  const reduced = [];
  for (const expected of [132, 0, 132]) {
    await toggle(panel);
    await page.waitForTimeout(32);
    reduced.push(await sample(panel, 0));
    expect.soft(reduced.at(-1)!.px).toBe(expected);
  }
  evidence.reduced = reduced;
  const lesson = await panel.locator('a').first().elementHandle();
  await page
    .getByRole('button', { name: 'Collapse sidebar', exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await page.waitForTimeout(32);
  expect.soft((await sample(panel, 0)).px).toBe(0);
  await expect(panel).toHaveAttribute('inert');
  expect.soft(await lesson!.evaluate((node) => node.isConnected)).toBe(true);
  await page
    .getByRole('button', { name: 'Expand sidebar', exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await page.waitForTimeout(32);
  expect.soft((await sample(panel, 0)).px).toBe(132);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    localStorage.setItem('lacuna.motionSpeed', 'normal');
    dispatchEvent(new CustomEvent('lacuna:motion-speed', { detail: 'normal' }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Open navigation' })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await page.waitForTimeout(700);
  const drawer = page.getByRole('dialog', { name: 'Navigation', exact: true });
  const drawerId = await drawer
    .getByRole('button', { name: 'Expand History' })
    .getAttribute('aria-controls');
  const drawerPanel = drawer.locator(`[id="${drawerId}"]`);
  const drawerOpen = await curve(page, drawerPanel);
  const drawerClose = await curve(page, drawerPanel);
  evidence.drawer = { open: drawerOpen, close: drawerClose };
  checkFlow(drawerOpen, true);
  checkFlow(drawerClose, false);
  await page.screenshot({ path: test.info().outputPath('mobile-drawer-closed.png') });
  await writeFile(test.info().outputPath('curves.json'), JSON.stringify(evidence, null, 2));
  expect.soft(errors).toEqual([]);
});
