import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function expectLabelContained(trigger: Locator) {
  await expect
    .poll(() =>
      trigger.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        const surface = button.parentElement!.getBoundingClientRect();
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        const labels: DOMRect[] = [];
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(walker.currentNode);
          labels.push(...range.getClientRects());
        }
        return (
          labels.length > 0 &&
          labels.every((label) =>
            [bounds, surface].every(
              (box) =>
                label.left >= box.left - 1 &&
                label.right <= box.right + 1 &&
                label.top >= box.top - 1 &&
                label.bottom <= box.bottom + 1,
            ),
          ) &&
          button.scrollHeight <= button.clientHeight &&
          button.scrollWidth <= button.clientWidth
        );
      }),
    )
    .toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

async function expectKeyboardFocus(trigger: Locator) {
  await expect(trigger).toBeFocused();
  expect(
    await trigger.evaluate((button) => {
      const style = getComputedStyle(button);
      return (
        button.matches(':focus-visible') &&
        (style.boxShadow !== 'none' ||
          (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0))
      );
    }),
  ).toBe(true);
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`dashboard header actions contain enlarged labels (${reducedMotion})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await expect(page.getByRole('region', { name: 'Today, most urgent first' })).toBeVisible();
    const main = page.locator('main');
    const create = main.getByRole('button', { name: 'New course', exact: true });
    const importing = main.getByRole('button', { name: 'Import', exact: true });

    // These are the existing resting dimensions at the default text size.
    for (const [trigger, width] of [
      [create, 152],
      [importing, 100],
    ] as const) {
      await expect(trigger).toBeVisible();
      await expect
        .poll(async () => {
          const box = (await trigger.locator('..').boundingBox())!;
          return { width: Math.round(box.width), height: Math.round(box.height) };
        })
        .toEqual({ width, height: 44 });
      await trigger.screenshot({ path: test.info().outputPath(`default-${width}.png`) });
    }
    await page.screenshot({ path: test.info().outputPath('390-default.png') });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await page.screenshot({
      path: test.info().outputPath('390-large-text.png'),
      animations: 'disabled',
    });
    await expectLabelContained(create);
    await expectLabelContained(importing);
    await expectNoHorizontalOverflow(page);

    const form = page.getByRole('form', { name: 'New course', exact: true });
    const name = form.getByRole('textbox', { name: 'Course name' });
    await create.click();
    await expect(name).toBeFocused();
    await expect
      .poll(async () => {
        const field = (await name.boundingBox())!;
        const button = (await create.boundingBox())!;
        return field.y >= button.y + button.height;
      })
      .toBe(true);
    await expectNoHorizontalOverflow(page);
    await name.press('Escape');
    await expect(form).toBeHidden();
    await expect(create).toBeFocused();

    await page.keyboard.press('Tab');
    await expectKeyboardFocus(importing);
    await importing.screenshot({ path: test.info().outputPath('import-focus.png') });
    await page.keyboard.press('Shift+Tab');
    await expectKeyboardFocus(create);
    await create.screenshot({ path: test.info().outputPath('new-course-focus.png') });
    await create.press('Enter');
    await expect(name).toBeFocused();
    await name.press('Escape');

    await importing.click();
    const source = main.getByRole('button', { name: /^Lacuna course/ });
    await expect(source).toBeVisible();
    await expect
      .poll(async () => {
        const option = (await source.boundingBox())!;
        const close = (await main
          .getByRole('button', { name: 'Close', exact: true })
          .boundingBox())!;
        return option.y >= close.y + close.height;
      })
      .toBe(true);
    await expectNoHorizontalOverflow(page);
    await main.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(source).toBeHidden();
    await create.focus();
    await page.keyboard.press('Tab');
    await expectKeyboardFocus(importing);
    await importing.press('Space');
    await expect(source).toBeVisible();
    await source.focus();
    await source.press('Escape');
    await expect(importing).toBeFocused();
    await expect(source).toBeHidden();
    await expectLabelContained(create);
    await expectLabelContained(importing);
    await expectNoHorizontalOverflow(page);
  });
}
