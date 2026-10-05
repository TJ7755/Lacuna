import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('a listed lesson opens its real workspace; Add creates a real lesson', async ({ page }) => {
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
  const courseUrl = page.url();
  await page.getByRole('button', { name: 'Scheduling philosophy', exact: true }).click();
  await expect(page).toHaveURL(/\/lesson\//);
  await expect(page.locator('[data-lesson-workspace-mode]')).toBeVisible();
  await page.goto(courseUrl);
  await page.getByRole('button', { name: 'Edit mode' }).click();
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await add.click();
  await page.getByRole('button', { name: 'Lesson', exact: true }).click();
  await page.getByRole('textbox', { name: 'Lesson name' }).fill('Course overview regression');
  await page.getByRole('button', { name: 'Create lesson' }).click();
  await expect(page).toHaveURL(/\/lesson\//);
  await expect(page.getByRole('heading', { name: 'Course overview regression', exact: true })).toBeVisible();
  await page.goto(courseUrl);
  await expect(page.getByRole('button', { name: 'Course overview regression', exact: true })).toBeVisible();
});

test('Add returns to its own corner without enlarging its disappearing text', async ({ page }) => {
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
  await page.getByRole('button', { name: 'Edit mode' }).click();
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await add.click();
  await expect(page.getByRole('group', { name: 'Add to course' })).toBeVisible();
  await expect.poll(() => page.getByRole('button', { name: 'Add', exact: true }).locator('..').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(216);
  const measured = await page.evaluate(async () => {
    const rect = () => {
      const button = document.querySelector('[role="group"][aria-label="Add to course"] button');
      if (!button) return null;
      const text = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!text) throw new Error('Missing option text');
      const range = document.createRange();
      range.selectNodeContents(text);
      const bounds = range.getBoundingClientRect();
      return { height: bounds.height, top: bounds.top };
    };
    const baseline = rect()!;
    document.querySelector<HTMLButtonElement>('button[aria-controls][aria-expanded]')!.click();
    const samples = [];
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 8));
      const sample = rect();
      if (sample) samples.push(sample);
    }
    return { baseline, samples };
  });
  expect(measured.samples.length).toBeGreaterThan(0);
  for (const sample of measured.samples) {
    expect(Math.abs(sample.height - measured.baseline.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.top - measured.baseline.top)).toBeLessThanOrEqual(1);
  }
  await expect.poll(() => page.getByRole('button', { name: 'Add', exact: true }).locator('..').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(84);
  await add.click();
  await page.getByRole('button', { name: 'Checkpoint', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name' }).press('Escape');
  await expect(add).toBeFocused();
});


test('narrow-screen keyboard activation opens the focused lesson', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
  const stop = page.getByRole('button', { name: 'Scheduling philosophy', exact: true });
  await stop.focus();
  await stop.press('Enter');
  await expect(page).toHaveURL(/\/lesson\//);
  await expect(page.getByRole('heading', { name: 'Scheduling philosophy', exact: true })).toBeVisible();
});

test('reduced motion changes Add dimensions without interpolating', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
  await page.getByRole('button', { name: 'Edit mode' }).click();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  const samples = await page.evaluate(async () => {
    const surface = document.querySelector<HTMLElement>('button[aria-controls][aria-expanded]')!.parentElement!;
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-controls][aria-expanded]')!;
    const widths: number[] = [];
    for (let toggle = 0; toggle < 2; toggle++) {
      trigger.click();
      for (let frame = 0; frame < 12; frame++) {
        await new Promise(requestAnimationFrame);
        widths.push(surface.getBoundingClientRect().width);
      }
    }
    return widths;
  });
  expect(samples).toContain(216);
  expect(samples.at(-1)).toBe(84);
  expect(samples.every((width) => Math.abs(width - 84) < 1 || Math.abs(width - 216) < 1)).toBe(true);
});


test('practice editing keeps an unobstructed 44px touch target with a long name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
  await page.getByRole('button', { name: 'Edit mode' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  const name = 'Practice with a long name covering several lines';
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('combobox', { name: 'Position on the path' }).selectOption('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const edit = page.getByRole('button', { name: `Edit ${name}`, exact: true });
  await expect(edit).toBeVisible();
  const bounds = await edit.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  const next = await edit
    .locator('xpath=ancestor::li[1]/following-sibling::li[1]')
    .boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(next!.y);
});
