import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`card entry keeps invalid Tab traversal and the repeat loop (${reducedMotion})`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await createCourse(page, 'Keyboard contract');
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    const front = page.getByRole('textbox', { name: 'Front', exact: true });
    const back = page.getByRole('textbox', { name: 'Back', exact: true });
    await expect(front).toBeFocused();
    await front.fill('First question');
    await page.keyboard.press('Tab');
    await expect(back).toBeFocused();
    await expect(page.getByRole('button', { name: 'Save & add another' })).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(back).not.toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(back).toBeFocused();
    await back.fill('First answer');
    await page.keyboard.press('Shift+Tab');
    await expect(front).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(back).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Save & add another' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(front).toHaveValue('');
    await expect(front).toBeFocused();
    await front.fill('Second question');
    await page.keyboard.press('Tab');
    await back.fill('Second answer');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(front).toHaveValue('');
    await expect(front).toBeFocused();
    await expect(page.getByText('2 added', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('repeat-entry.png') });
  });
}

test('course composition confirmation does not submit and ordinary Enter still creates', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page.locator('main').getByRole('button', { name: 'New course' }).click();
  const form = page.getByRole('form', { name: 'New course' });
  const name = form.getByRole('textbox', { name: 'Course name' });
  await name.fill('Composition course');
  await name.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  await expect(form).toBeVisible();
  await expect(name).toBeFocused();
  await name.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 });
  await expect(form).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
});

for (const width of [320, 390]) {
  test(`creation pills keep their expanded forms within a ${width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    const trigger = page.locator('main').getByRole('button', { name: 'New course', exact: true });
    await trigger.click();
    const form = page.getByRole('form', { name: 'New course' });
    const bounds = await form.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(form).toBeHidden();
  });
}
