import { expect, test } from '@playwright/test';

for (const width of [1280, 768]) {
  test(`New course keeps its form open after a double-click at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => {
      localStorage.setItem('lacuna-onboarding', 'done');
      localStorage.setItem('lacuna-seeded', '1');
      localStorage.setItem('lacuna-theme', 'light');
    });
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    const trigger = page.getByRole('button', { name: 'New course', exact: true });
    const form = page.getByRole('form', { name: 'New course', exact: true });
    const name = form.getByRole('textbox', { name: 'Course name', exact: true });

    await trigger.dblclick();
    // Element screenshots wait for the expanding surface to stop moving.
    await trigger
      .locator('..')
      .screenshot({ path: testInfo.outputPath('double-click-surface.png') });
    await page.screenshot({
      path: testInfo.outputPath('double-click.png'),
      animations: 'disabled',
    });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(form).toBeVisible();
    await name.fill('Biology');
    await expect(name).toHaveValue('Biology');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();

    await trigger.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(name).toBeFocused();
    await name.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();

    await trigger.press('Space');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(name).toBeFocused();
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(name).toBeFocused();
    await trigger
      .locator('..')
      .screenshot({ path: testInfo.outputPath('final-open-form-surface.png') });
    await page.screenshot({
      path: testInfo.outputPath('final-open-form.png'),
      animations: 'disabled',
    });
  });
}
