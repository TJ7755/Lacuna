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
  const { form, surface, closedHeight } = await openDesktopCreation(page);
  const steady = form.getByRole('radio', { name: /Steady retention/ });
  const observed = await surface.evaluate(
    (element, { exam, steady, form, closedHeight }) =>
      new Promise<{ initial: number; expanded: number; intermediate: number[]; reversed: boolean }>(
        (resolve) => {
          if (
            !(element instanceof HTMLElement) ||
            !(exam instanceof HTMLElement) ||
            !(steady instanceof HTMLElement)
          )
            throw new Error('Expected HTML creation controls');
          const initial = element.getBoundingClientRect().height;
          const intermediate: number[] = [];
          let expanded = initial;
          let reversed = false;
          let samples = 0;
          const sample = () => {
            const height = element.getBoundingClientRect().height;
            const target =
              form.parentElement!.getBoundingClientRect().height +
              closedHeight +
              element.offsetHeight -
              element.clientHeight;
            expanded = Math.max(expanded, target);
            if (!reversed && height > initial + 1 && height < target - 1) {
              intermediate.push(height);
              reversed = true;
              steady.focus();
              steady.click();
            }
            if ((reversed && Math.abs(height - initial) < 1) || ++samples >= 120)
              resolve({ initial, expanded, intermediate, reversed });
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
          exam.click();
        },
      ),
    {
      exam: (await form.getByRole('radio', { name: /Exam date/ }).elementHandle())!,
      steady: (await steady.elementHandle())!,
      form: (await form.elementHandle())!,
      closedHeight,
    },
  );
  expect(observed.expanded).toBeGreaterThan(observed.initial);
  expect(observed.intermediate.length).toBeGreaterThan(0);
  expect(observed.reversed).toBe(true);
  await expect(steady).toBeChecked();
  await expect(steady).toBeFocused();
  await expect
    .poll(async () => Math.abs((await surface.boundingBox())!.height - observed.initial))
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
  const reopened = await surface.evaluate(
    (element, { trigger, closedHeight }) =>
      new Promise<boolean>((resolve) => {
        if (!(trigger instanceof HTMLElement)) throw new Error('Expected an HTML creation trigger');
        const openHeight = element.getBoundingClientRect().height;
        let samples = 0;
        const sample = () => {
          const height = element.getBoundingClientRect().height;
          if (
            height > closedHeight + 1 &&
            height < closedHeight + (openHeight - closedHeight) / 4
          ) {
            trigger.click();
            resolve(true);
          } else if (++samples >= 120) resolve(false);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        trigger.click();
      }),
    { trigger: (await trigger.elementHandle())!, closedHeight },
  );
  expect(reopened).toBe(true);
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
