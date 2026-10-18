import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`text-size updates reflow once without springing controls (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await page.goto('/#/settings');
    const sizes = page.getByRole('radiogroup', { name: 'Text size', exact: true });
    await expect(sizes).toBeVisible();
    await page.waitForTimeout(700);
    for (const label of ['Larger', 'Small', 'Default']) {
      await sizes.getByRole('radio', { name: label, exact: true }).focus();
      const frames = await sizes.evaluate(async (group, name) => {
        const button = group.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
        button.click();
        const frames: { font: string; moving: string[] }[] = [];
        for (let i = 0; i < 30; i++) {
          await new Promise(requestAnimationFrame);
          frames.push({
            font: getComputedStyle(document.documentElement).fontSize,
            moving: [
              ...document.querySelectorAll<HTMLElement>(
                '#settings-appearance *, #settings-input *',
              ),
            ]
              .filter((element) => {
                const style = getComputedStyle(element);
                const matrix = new DOMMatrixReadOnly(style.transform);
                return (
                  Math.abs(matrix.a - 1) > 0.001 ||
                  Math.abs(matrix.d - 1) > 0.001 ||
                  Math.abs(matrix.e) > 0.1 ||
                  Math.abs(matrix.f) > 0.1 ||
                  (style.scale !== 'none' && style.scale !== '1')
                );
              })
              .map((element) => element.outerHTML.slice(0, 150)),
          });
        }
        return frames;
      }, label);
      expect([...new Set(frames.map((frame) => frame.font))]).toHaveLength(1);
      expect(frames.flatMap((frame) => frame.moving)).toEqual([]);
      await expect(sizes.getByRole('radio', { name: label, exact: true })).toBeFocused();
    }
    // Ordinary selection motion remains available after the resize.
    const themes = page.getByRole('radiogroup', { name: 'Theme', exact: true });
    const selectionMoved = await themes.evaluate(async (group) => {
      [...group.querySelectorAll<HTMLButtonElement>('[role=radio]')]
        .find((button) => button.textContent === 'Light')!
        .click();
      let moved = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(requestAnimationFrame);
        const indicator = group.querySelector('[aria-checked=true] > [aria-hidden=true]')!;
        const matrix = new DOMMatrixReadOnly(getComputedStyle(indicator).transform);
        moved ||= Math.abs(matrix.e) > 0.1;
      }
      return moved;
    });
    expect(selectionMoved).toBe(reducedMotion === 'no-preference');
    await expect(themes.getByRole('radio', { name: 'Light', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
}

test('input mode round trips preserve text size and persist', async ({ page }) => {
  await enterFreshLacuna(page);
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
  await enterFreshLacuna(page);
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
