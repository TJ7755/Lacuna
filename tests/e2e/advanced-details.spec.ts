import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

for (const width of [1280, 390]) {
  test(`advanced details persist and update an open course at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterWithWelcomeCourse(page);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
      .click();
    await expect(page).toHaveURL(/#\/course\/[^/]+$/);
    const courseUrl = page.url();
    await page.goto(`${courseUrl}/settings`);
    const advancedSection = page.getByRole('button', { name: /^Advanced scheduling(?: |$)/ });
    const target = page.getByRole('slider', { name: 'Target retention' });
    await expect(page.getByRole('heading', { name: 'Daily workload' })).toBeVisible();
    await expect(advancedSection).toHaveCount(0);
    await expect(target).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('course-basic.png') });
    await page.getByRole('button', { name: /^Auto-practice(?: |$)/ }).click();
    const timing = page.getByRole('button', { name: /^Advanced practice timing/ });
    await expect(page.getByRole('switch', { name: 'Auto-practice', exact: true })).toBeVisible();
    await expect(timing).toHaveCount(0);

    // Change the preference in Settings while the course stays mounted in the first tab.
    const settings = await page.context().newPage();
    await settings.goto('/#/settings#settings-study');
    const toggle = settings.getByRole('switch', { name: 'Show advanced details' });
    await expect(toggle).not.toBeChecked();
    await toggle.focus();
    await toggle.press('Space');
    await expect(toggle).toBeChecked();
    await expect(advancedSection).toBeVisible();
    await expect(target).toBeVisible();
    await expect(timing).toBeVisible();
    const retention = await target.inputValue();
    await page.screenshot({ path: testInfo.outputPath('course-advanced.png') });

    await toggle.press('Space');
    await expect(advancedSection).toHaveCount(0);
    await expect(target).toHaveCount(0);
    await expect(timing).toHaveCount(0);
    await toggle.press('Space');
    await expect(target).toHaveValue(retention);
    await settings.close();
    await page.reload();
    await expect(advancedSection).toBeVisible();

    await page.goto('/#/analytics');
    await expect(
      page.getByRole('heading', { name: 'Stability profile', exact: true }),
    ).toBeAttached();
    await page.goto('/#/settings#settings-study');
    const preference = page.getByRole('switch', { name: 'Show advanced details' });
    await expect(preference).toBeChecked();
    await preference.click();
    await preference.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('settings-preference.png') });
    await page.goto('/#/analytics');
    await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stability profile', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText('Brier score', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('progress-basic.png') });
    expect(
      await page.locator('main').evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
  });
}
