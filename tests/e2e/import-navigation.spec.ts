import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna, openImport } from './fixtures/lacunaApp';
import { settle } from './fixtures/flowEvidence';

for (const width of [1280, 390]) {
  test(`opens imports inside Today and keeps the panel usable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await enterFreshLacuna(page);
    await openImport(page);
    const panel = page.locator('.import-panel');
    const surface = page.locator('.flow-expansion').filter({ has: panel });
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/#\/\?import=1$/);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    const checkBounds = async () => {
      // The surface stays on screen while longer steps scroll within it.
      await expect.poll(async () => (await surface.boundingBox())!.x).toBeGreaterThanOrEqual(0);
      await expect
        .poll(async () => {
          const bounds = (await surface.boundingBox())!;
          return bounds.x + bounds.width;
        })
        .toBeLessThanOrEqual(width);
      await expect
        .poll(async () => {
          const bounds = (await surface.boundingBox())!;
          return bounds.y + bounds.height;
        })
        .toBeLessThanOrEqual(844);
    };
    const capture = async (name: string) => {
      if (width !== 1280) return;
      await settle(surface);
      await testInfo.attach(name, { body: await surface.screenshot(), contentType: 'image/png' });
    };
    await checkBounds();
    await capture('Import sources');

    const sourceRow = panel.getByRole('button', { name: /Course library/ });
    const sourceBounds = (await sourceRow.boundingBox())!;
    if (width === 1280) {
      const title = surface.locator('.import-control-title');
      const close = surface.getByRole('button', { name: 'Close', exact: true });
      const titleBounds = (await title.boundingBox())!;
      const closeBounds = (await close.boundingBox())!;
      expect(Math.abs(titleBounds.x - sourceBounds.x)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(titleBounds.y + titleBounds.height / 2 - closeBounds.y - closeBounds.height / 2),
      ).toBeLessThanOrEqual(1);
    }
    const sources = ['Course library', 'Lacuna course', 'Anki deck', 'Text or spreadsheet'];
    if (width === 1280) sources.push('Join a class');
    for (const source of sources) {
      await panel.getByRole('button', { name: new RegExp(source) }).click();
      const back = panel.getByRole('button', { name: 'Back to import sources' });
      await expect(back).toBeVisible();
      await checkBounds();
      await capture(source);
      if (width === 1280) {
        const backIcon = (await back.locator('svg').boundingBox())!;
        expect(Math.abs(backIcon.x - sourceBounds.x)).toBeLessThanOrEqual(1);
      }
      if (source === 'Join a class') {
        const code = panel.getByRole('textbox', { name: 'Class code' });
        await expect(code).toBeFocused();
        const codeBounds = (await code.boundingBox())!;
        expect(Math.abs(codeBounds.x - sourceBounds.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(codeBounds.width - sourceBounds.width)).toBeLessThanOrEqual(1);
      }
      if (source === 'Text or spreadsheet') {
        await panel.getByRole('textbox', { name: 'Paste your cards' }).fill('Hello,Bonjour');
        await panel.getByRole('button', { name: 'Review cards' }).click();
        await expect(panel.getByRole('button', { name: 'Choose destination' })).toBeVisible();
        await checkBounds();
        await capture('Card review');
        await panel.getByRole('button', { name: 'Choose destination' }).click();
        const examDate = panel.getByRole('radio', { name: /Exam date/ });
        await examDate.focus();
        await examDate.press('Space');
        await expect(examDate).toBeChecked();
        await expect(panel.getByText('Exam date and time', { exact: true })).toBeVisible();
        await checkBounds();
        await capture('Card destination');
      }
      if (source === 'Course library') {
        const search = panel.getByRole('searchbox', { name: 'Search the course library' });
        await expect(search).toBeFocused();
        await search.fill('biology');
        const subjects = panel.getByRole('list', { name: 'Library subjects' });
        const lastCourse = subjects
          .getByRole('list', { name: 'Biology courses' })
          .getByRole('button')
          .last();
        // Results mount before the disclosure has expanded enough to scroll to its last row.
        await expect
          .poll(() =>
            lastCourse.evaluate((course) => {
              const list = course.closest('.import-library-subjects')!;
              return (
                course.getBoundingClientRect().bottom -
                  list.getBoundingClientRect().top +
                  list.scrollTop <=
                list.scrollHeight + 1
              );
            }),
          )
          .toBe(true);
        await subjects.hover();
        await page.mouse.wheel(0, await subjects.evaluate((list) => list.scrollHeight));
        await expect(lastCourse).toBeInViewport();
        await checkBounds();
      }
      if (source === 'Lacuna course') {
        const input = panel.getByRole('textbox', { name: 'Share link or code to import' });
        await input.focus();
        await expect(input).toHaveCSS('box-shadow', 'none');
        await expect(input.locator('..')).not.toHaveCSS('box-shadow', 'none');
      }
      await back.click();
      await expect(panel.getByText('Drop a file here')).toBeVisible();
      await expect(panel.getByRole('button', { name: new RegExp(source) })).toBeFocused();
    }
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/#\/$/);
    // Bookmarks and links from the landing page still reach the same panel.
    await page.goto('/#/import');
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/#\/\?import=1$/);
  });
}

for (const width of [1280, 390]) {
  test(`keeps import dropdown chevrons inset and controls within bounds at ${width}px`, async ({
    page,
  }, testInfo) => {
    await enterFreshLacuna(page);
    const courseName = 'French vocabulary with a deliberately long destination name';
    await createCourse(page, courseName);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/');
    await openImport(page);
    await page.getByRole('button', { name: /Text or spreadsheet/ }).click();
    const panel = page.locator('.import-panel');
    await panel.getByLabel('Paste your cards').fill('Hello\tBonjour');
    await panel.getByRole('button', { name: 'Review cards', exact: true }).click();
    await panel.getByRole('button', { name: 'Choose destination', exact: true }).click();
    const destination = panel.getByRole('combobox', { name: 'Destination', exact: true });
    await destination.selectOption({ label: courseName });
    await expect(destination.locator('option:checked')).toHaveText(courseName);
    const lesson = panel.getByRole('combobox', { name: 'Lesson', exact: true });
    await destination.focus();
    await destination.press('Tab');
    await expect(lesson).toBeFocused();
    await lesson.selectOption({ label: 'Lesson 1' });
    await expect(lesson.locator('option:checked')).toHaveText('Lesson 1');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle('dark', dark),
        theme === 'dark',
      );
      for (const select of [destination, lesson]) {
        await select.focus();
        await expect(select).toHaveCSS('appearance', 'none');
        await expect(select).not.toHaveCSS('background-image', 'none');
        const metrics = await select.evaluate((element) => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return {
            padding: parseFloat(style.paddingRight),
            left: bounds.left,
            right: bounds.right,
          };
        });
        expect(metrics.padding).toBeGreaterThanOrEqual(36);
        expect(metrics.left).toBeGreaterThanOrEqual(0);
        expect(metrics.right).toBeLessThanOrEqual(width);
      }
      const path = testInfo.outputPath(`import-dropdowns-${width}-${theme}.png`);
      await panel.screenshot({ path });
      await testInfo.attach(`${width}px ${theme} import dropdowns`, {
        path,
        contentType: 'image/png',
      });
    }
  });
}
