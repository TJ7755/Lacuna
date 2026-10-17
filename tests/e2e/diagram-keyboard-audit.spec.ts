import { expect, test, type Locator } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function rect(region: Locator) {
  return region.evaluate((element) => {
    const style = (element as HTMLElement).style;
    return {
      x: parseFloat(style.left),
      y: parseFloat(style.top),
      w: parseFloat(style.width),
      h: parseFloat(style.height),
    };
  });
}

for (const width of [390, 1440]) {
  test(`authors, adjusts and saves a diagram with the keyboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({
      reducedMotion: 'reduce',
      colorScheme: width === 390 ? 'dark' : 'light',
    });
    await enterFreshLacuna(page);
    const course = page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('link', { name: 'Welcome to Lacuna', exact: true });
    await course.focus();
    await course.press('Enter');
    const courseUrl = page.url();
    await page.goto(`${courseUrl}/cards`);
    const menu = page.getByRole('button', { name: 'More ways to add', exact: true });
    await menu.focus();
    await menu.press('ArrowDown');
    await page.getByRole('menu', { name: 'More ways to add' }).press('End');
    await expect(page.getByRole('menuitem', { name: 'New occlusion' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'New occlusion', exact: true })).toBeVisible();

    const name = page.getByRole('textbox', { name: 'Name', exact: true });
    await name.fill('Keyboard diagram');
    await name.press('Tab');
    await expect(page.getByRole('button', { name: 'Draw label box' })).toBeFocused();
    await page
      .getByLabel('Upload diagram', { exact: true })
      .setInputFiles(fileURLToPath(new URL('../../public/icons/icon-512.png', import.meta.url)));
    const canvas = page.getByRole('group', { name: 'Draw a region' });
    await expect(canvas).toBeVisible();
    const masks = canvas.locator('[style*="left:"]');
    await canvas.focus();
    await canvas.press('Enter');
    await expect(masks).toHaveCount(1);
    await canvas.press('Escape');
    await expect(masks).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'New occlusion', exact: true })).toBeVisible();

    await canvas.press('Space');
    await canvas.press('ArrowRight');
    await canvas.press('ArrowDown');
    await canvas.press('Shift+ArrowRight');
    await canvas.press('Shift+ArrowDown');
    await expect.poll(() => rect(masks.first())).toEqual({ x: 41, y: 41, w: 21, h: 21 });
    await canvas.press('Enter');
    await expect(page.getByRole('button', { name: 'Delete Box 1' })).toBeVisible();
    await expect(page.getByText('1 card will be generated', { exact: true })).toBeVisible();

    const select = page.getByRole('button', { name: 'Select', exact: true });
    await select.focus();
    await select.press('Enter');
    const region = page.getByRole('button', { name: 'Region 1', exact: true });
    await region.focus();
    await region.press('Space');
    await expect(region).toHaveAttribute('aria-pressed', 'true');
    const positioning = page.getByRole('group', { name: 'Position selected region' });
    await positioning.focus();
    await positioning.press('ArrowLeft');
    await positioning.press('Shift+ArrowUp');
    await expect.poll(() => rect(region)).toEqual({ x: 40, y: 41, w: 21, h: 20 });
    await name.focus();
    await name.press('Tab');
    await expect(page.getByRole('button', { name: 'Draw label box' })).toBeFocused();
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('keyboard-diagram.png'),
    });
    await page.keyboard.press('Control+Enter');
    await expect(page).toHaveURL(`${courseUrl}/cards`);
    await expect(page.getByText('Keyboard diagram', { exact: true })).toBeVisible();
    const edit = page.getByRole('button', { name: 'Edit occlusion', exact: true });
    await edit.focus();
    await edit.press('Enter');
    await expect(name).toHaveValue('Keyboard diagram');
    await select.focus();
    await select.press('Enter');
    await expect
      .poll(() => rect(page.getByRole('button', { name: 'Region 1', exact: true })))
      .toEqual({ x: 40, y: 41, w: 21, h: 20 });
  });
}
