import { expect, test, type Page } from '@playwright/test';

async function openSeededDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'From familiarity to recall' })).toBeVisible();
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

async function expectCardsThenRows(page: Page, headingName: string, row: string) {
  await expect(page.getByRole('heading', { level: 1, name: headingName })).toHaveCount(1);
  await expect(page.getByRole('complementary', { name: 'Page sections' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: new RegExp(row) })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
}

test('Settings and Help keep clear headings and expandable guidance', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openSeededDashboard(page);

  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Preferences', { exact: true })).toHaveCount(0);
  await expectCardsThenRows(page, 'Settings', 'Your data');
  await expect(page.locator('main header').getByText(/^Version /)).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('settings-version.png'),
    animations: 'disabled',
  });

  await page.goto('/#/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
  await expect(page.getByText('Documentation', { exact: true })).toHaveCount(0);
  await expectCardsThenRows(page, 'Help', 'Which card type should I use?');
  await expect(page.getByRole('searchbox', { name: 'Search help' })).toBeVisible();
  await page.getByRole('button', { name: 'Which card type should I use?' }).click();
  await expect(page.getByLabel('Card examples')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search help' }).fill('picture sharing');
  await expect(page.getByText(/Share → Other ways → Course file/)).toBeVisible();

  await page.goto('/#/help#occlusions');
  await expect(page.getByRole('button', { name: 'How do I make diagram cards?' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByText(/Upload a labelled diagram/)).toBeVisible();
  await page.getByRole('button', { name: 'How do I share a diagram with its image?' }).click();
  await expect(page.getByText(/Share → Other ways → Course file/)).toBeVisible();

  await page.setViewportSize({ width: 900, height: 900 });
  for (const route of ['/#/settings', '/#/help']) {
    await page.goto(route);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
