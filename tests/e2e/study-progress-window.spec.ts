import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createCourse } from './fixtures/lacunaApp';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 2000, height: 1170 },
  { width: 390, height: 844 },
]) {
  test(`keeps a 322-card progress strip readable at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await createCourse(page, 'Biology');
    const courseId = /#\/course\/([^/]+)/.exec(page.url())![1];
    await page.getByRole('button', { name: 'Edit mode' }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page
      .getByRole('textbox', { name: 'Front' })
      .fill('What is the role of the mitochondria?');
    await page
      .getByRole('textbox', { name: 'Back' })
      .fill('They produce ATP through aerobic respiration.');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page).not.toHaveURL(/\/cards\/new$/);
    await page.evaluate(async (id) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('cards', 'readwrite');
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          const store = transaction.objectStore('cards');
          const get = store.index('courseId').getAll(id);
          get.onsuccess = () => {
            const template = get.result[0];
            store.delete(template.id);
            for (let index = 0; index < 322; index += 1) {
              store.put({ ...template, id: `biology-${String(index).padStart(3, '0')}` });
            }
          };
        };
      });
    }, courseId);
    await page.setViewportSize(viewport);
    await page.goto(`/#/course/${courseId}/learn?mode=simple`);
    const card = page.locator('[data-study-card-id]:not([inert])');
    await expect(card).toHaveCount(1);
    const pips = page.locator('[data-session-card-status]');
    await expect(pips).toHaveCount(322);
    expect(
      await pips.first().evaluate((pill) => pill.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(16);
    const row = page.locator('[data-session-segment-row]');
    const geometry = await row.evaluate((row) => {
      const width = row.parentElement!.clientWidth;
      const pillWidth = row.firstElementChild!.getBoundingClientRect().width;
      const gap = Number.parseFloat(getComputedStyle(row).columnGap);
      const bounds = row.parentElement!.getBoundingClientRect();
      const visibleCount = Array.from(row.children).filter((pill) => {
        const rect = pill.getBoundingClientRect();
        return rect.left >= bounds.left - 0.5 && rect.right <= bounds.right + 0.5;
      }).length;
      return {
        width,
        pillWidth,
        gap,
        height: bounds.height,
        headerHeight: document.querySelector('header')!.getBoundingClientRect().height,
        size: Math.round((width + gap) / (pillWidth + gap)),
        visibleCount,
      };
    });
    expect(geometry.visibleCount).toBe(viewport.width === 390 ? 6 : 17);
    expect(geometry.height).toBe(viewport.width === 390 ? 8 : 10);
    expect(geometry.headerHeight).toBe(84);
    const trigger = Math.floor(geometry.size * 0.8);
    const stride = trigger - Math.floor(geometry.size * 0.2);
    const target = -stride * (geometry.pillWidth + geometry.gap);
    const position = () =>
      row.evaluate((row) => new DOMMatrixReadOnly(getComputedStyle(row).transform).m41);
    const answer = async () => {
      const oldCard = await card.getAttribute('data-study-card-id');
      await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
      await page.getByRole('button', { name: 'Yes', exact: true }).click();
      await expect(card).not.toHaveAttribute('data-study-card-id', oldCard!);
    };
    await page.screenshot({ path: testInfo.outputPath('start.png') });
    for (let index = 0; index < trigger - 1; index += 1) await answer();
    expect(await position()).toBe(0);
    await expect(
      page.locator('header').getByText(`· ${trigger} of 322`, { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('near-80-percent.png') });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
    const frames = await page
      .getByRole('button', { name: 'Yes', exact: true })
      .evaluate(async (button) => {
        const row = document.querySelector<HTMLElement>('[data-session-segment-row]')!;
        const pill = row.firstElementChild as HTMLElement;
        const frames: Array<{
          time: number;
          x: number;
          width: number;
          pillLeft: number;
          pillWidth: number;
        }> = [];
        const started = performance.now();
        const sample = () =>
          frames.push({
            time: performance.now() - started,
            x: new DOMMatrixReadOnly(getComputedStyle(row).transform).m41,
            width: row.offsetWidth,
            pillLeft: pill.offsetLeft,
            pillWidth: pill.offsetWidth,
          });
        sample();
        (button as HTMLButtonElement).click();
        await new Promise<void>((resolve) => {
          const tick = () => {
            sample();
            if (performance.now() - started >= 1_000) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        return frames;
      });
    await writeFile(
      testInfo.outputPath('glide-frames.json'),
      JSON.stringify({ viewport, geometry, trigger, target, frames }, null, 2),
    );
    await expect.poll(position).toBeCloseTo(target, 0);
    const moving = frames.filter((frame) => frame.x < -0.5 && frame.x > target + 0.5);
    expect(moving.length).toBeGreaterThan(5);
    for (let index = 1; index < frames.length; index += 1) {
      expect(frames[index].x).toBeLessThanOrEqual(frames[index - 1].x + 0.1);
      expect(frames[index].width).toBe(frames[0].width);
      expect(frames[index].pillLeft).toBe(frames[0].pillLeft);
      expect(frames[index].pillWidth).toBe(frames[0].pillWidth);
    }
    await page.screenshot({ path: testInfo.outputPath('after-glide.png') });
    const currentOffset = await pips.nth(trigger).evaluate((pill) => {
      const window = pill.parentElement!.parentElement!.getBoundingClientRect();
      return (pill.getBoundingClientRect().left - window.left) / window.width;
    });
    expect(currentOffset).toBeGreaterThanOrEqual(0.1);
    expect(currentOffset).toBeLessThan(0.3);
    await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeDisabled();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (let index = 0; index < stride - 1; index += 1) await answer();
    await answer();
    expect(await position()).toBeCloseTo(target * 2, 0);
    await page.setViewportSize({
      width: viewport.width === 390 ? 1440 : 390,
      height: viewport.height,
    });
    await expect
      .poll(async () => pips.first().evaluate((pill) => pill.getBoundingClientRect().width))
      .toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
