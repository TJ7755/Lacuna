import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterFreshLacuna, enterWithWelcomeCourse } from './fixtures/lacunaApp';

test('Tab leaves Other ways from its trigger in both directions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Other ways to study' });
  for (const [key, target] of [
    ['Tab', 'Add'],
    ['Shift+Tab', 'Study'],
  ] as const) {
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu', { name: 'Other ways to study' })).toBeVisible();
    await page.keyboard.press(key);
    await expect(page.getByRole('menu', { name: 'Other ways to study' })).toBeHidden();
    await expect(page.getByRole('button', { name: target, exact: true })).toBeFocused();
  }
});

async function assertPanelContained(trigger: Locator, menu: Locator) {
  // Menu visibility can precede Motion's size update, even at zero duration.
  await expect(async () => {
    const panel = (await menu.boundingBox())!;
    const surface = (await trigger.locator('..').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(surface.x - 1);
    expect(panel.y).toBeGreaterThanOrEqual(surface.y - 1);
    expect(panel.x + panel.width).toBeLessThanOrEqual(surface.x + surface.width + 1);
    expect(panel.y + panel.height).toBeLessThanOrEqual(surface.y + surface.height + 1);
  }).toPass();
}

for (const width of [390, 1440]) {
  test(`Add and Other ways share accessible expanding surfaces at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterWithWelcomeCourse(page);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
      .click();
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    for (const label of ['Add', 'Other ways to study']) {
      const trigger = page.getByRole('button', { name: label, exact: true });
      await expect(trigger).toBeVisible();
      const closedFont = await trigger.evaluate((element) => getComputedStyle(element).fontSize);
      const closed = (await trigger.locator('..').boundingBox())!;
      await trigger.focus();
      await page.keyboard.press('ArrowDown');
      const menu = page.getByRole('menu', { name: label, exact: true });
      const enabled = menu.locator('[role="menuitem"]:not(:disabled)');
      await expect(menu).toBeVisible();
      await expect(enabled.first()).toBeFocused();
      await assertPanelContained(trigger, menu);
      const opened = (await trigger.locator('..').boundingBox())!;
      expect(Math.abs(opened.x + opened.width - closed.x - closed.width)).toBeLessThanOrEqual(1);
      expect(await trigger.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
        closedFont,
      );
      expect(opened.height).toBeGreaterThan(closed.height);
      expect(opened.x).toBeGreaterThanOrEqual(0);
      expect(opened.x + opened.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('End');
      await expect(enabled.last()).toBeFocused();
      await page.keyboard.press('Home');
      await expect(enabled.first()).toBeFocused();
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`${label.replaceAll(' ', '-')}-${width}.png`),
      });
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(menu).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });
}

async function openDesktopCreation(page: Page) {
  await page.setViewportSize({ width: 1470, height: 956 });
  await enterFreshLacuna(page);
  const trigger = page.locator('main').getByRole('button', { name: 'New course', exact: true });
  await trigger.click();
  const form = page.getByRole('form', { name: 'New course' });
  const surface = trigger.locator('..');
  const closedHeight = await trigger.evaluate((element: HTMLElement) => element.offsetHeight);
  const targetHeight = async () =>
    (await form.locator('..').boundingBox())!.height +
    closedHeight +
    (await surface.evaluate((element: HTMLElement) => element.offsetHeight - element.clientHeight));
  await expect
    .poll(async () => Math.abs((await surface.boundingBox())!.height - (await targetHeight())))
    .toBeLessThan(1);
  await surface.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        let previous = '';
        let stable = 0;
        const sample = () => {
          const bounds = element.getBoundingClientRect();
          const geometry = [bounds.x, bounds.y, bounds.width, bounds.height].join(',');
          stable = geometry === previous ? stable + 1 : 0;
          previous = geometry;
          if (stable >= 2) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
  return { trigger, form, surface, closedHeight, targetHeight };
}

test('an open creation surface springs towards changed content and can reverse before arrival', async ({
  page,
}) => {
  const { form, surface, targetHeight } = await openDesktopCreation(page);
  const initialHeight = (await surface.boundingBox())!.height;
  const exam = form.getByRole('radio', { name: /Exam date/ });
  await exam.press('Space');
  const expandedHeight = await targetHeight();
  expect(expandedHeight).toBeGreaterThan(initialHeight);
  await expect
    .poll(async () => {
      const height = (await surface.boundingBox())!.height;
      return height > initialHeight + 1 && height < expandedHeight - 1;
    })
    .toBe(true);
  const steady = form.getByRole('radio', { name: /Steady retention/ });
  await steady.press('Space');
  await expect(steady).toBeChecked();
  await expect(steady).toBeFocused();
  await expect
    .poll(async () => Math.abs((await surface.boundingBox())!.height - initialHeight))
    .toBeLessThan(1);
});

test('reopening a visibly collapsing creation surface keeps its input, selection and focus', async ({
  page,
}) => {
  const { trigger, form, surface, closedHeight } = await openDesktopCreation(page);
  const name = form.getByRole('textbox', { name: 'Course name' });
  await name.fill('Retained course draft');
  await name.evaluate((element: HTMLInputElement) => element.setSelectionRange(3, 11));
  const input = (await name.elementHandle())!;
  const openHeight = (await surface.boundingBox())!.height;
  await trigger.press('Enter');
  // Reopen after most of the shape has collapsed, while it is still visibly in flight.
  await page.waitForFunction(
    ({ element, closedHeight, openHeight }) => {
      const height = element.getBoundingClientRect().height;
      return height > closedHeight + 1 && height < closedHeight + (openHeight - closedHeight) / 4;
    },
    { element: (await surface.elementHandle())!, closedHeight, openHeight },
  );
  await trigger.press('Enter');
  await expect(name).toBeFocused();
  expect(
    await input.evaluate((element: HTMLInputElement) => ({
      connected: element.isConnected,
      value: element.value,
      start: element.selectionStart,
      end: element.selectionEnd,
    })),
  ).toEqual({ connected: true, value: 'Retained course draft', start: 3, end: 11 });
});
