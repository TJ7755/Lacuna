import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

test('input mode round trips preserve text size and persist', async ({ page }) => {
  await enterWithWelcomeCourse(page);
  await page.goto('/#/settings');
  const input = page.getByRole('radiogroup', { name: 'Input mode', exact: true });
  await expect(input).toBeVisible();
  const font = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  for (const name of ['Keyboard', 'Touch', 'Keyboard', 'Touch', 'Keyboard', 'Touch', 'Auto']) {
    await input.getByRole('radio', { name, exact: true }).click();
    await expect(input.getByRole('radio', { name, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
      font,
    );
  }
  await page.reload();
  await expect(input.getByRole('radio', { name: 'Auto', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(font);
});

test('editor presentation follows explicit modes and Auto follows physical activity', async ({
  page,
}) => {
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  const course = new URL(page.url()).hash;
  const editor = `/${course}/cards/new`;
  const actions = page.getByRole('region', { name: 'Card editor actions' });
  const positions: Record<string, string[]> = { Keyboard: [], Touch: [] };
  for (const name of ['Keyboard', 'Touch', 'Keyboard', 'Touch', 'Keyboard', 'Touch']) {
    await page.goto('/#/settings');
    await page
      .getByRole('radiogroup', { name: 'Input mode', exact: true })
      .getByRole('radio', { name, exact: true })
      .click();
    await page.goto(editor);
    await expect(actions).toBeVisible();
    const position = await actions.evaluate((element) => getComputedStyle(element).position);
    positions[name].push(position);
    expect(position).toBe(name === 'Touch' ? 'fixed' : 'static');
    await page.keyboard.press('Tab');
    await page.dispatchEvent('body', 'pointerup', { pointerType: 'touch' });
    await expect(actions).toHaveCSS('position', position);
  }
  expect(new Set(positions.Keyboard).size).toBe(1);
  expect(new Set(positions.Touch).size).toBe(1);

  // Change the preference through another tab whilst the editor consumer stays mounted.
  const preferences = await page.context().newPage();
  await preferences.goto('/#/settings');
  await preferences
    .getByRole('radiogroup', { name: 'Input mode', exact: true })
    .getByRole('radio', { name: 'Auto', exact: true })
    .click();
  await preferences.close();
  await page.keyboard.press('Tab');
  await expect(actions).toHaveCSS('position', 'static');
  await page.dispatchEvent('body', 'pointerup', { pointerType: 'pen' });
  await expect(actions).toHaveCSS('position', 'fixed');
  await page.dispatchEvent('body', 'pointermove', { pointerType: 'mouse' });
  await expect(actions).toHaveCSS('position', 'static');
  expect(await page.evaluate(() => localStorage.getItem('lacuna.inputMode'))).toBe('auto');
  await page.reload();
  await expect(actions).toHaveCSS('position', 'static');
});
