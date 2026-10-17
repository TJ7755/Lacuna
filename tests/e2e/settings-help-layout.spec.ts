import { expect, test, type Page } from '@playwright/test';

async function openSeededDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Revision around your exam' })).toBeVisible();
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
  const groups = ['Getting started', 'Studying', 'Cards and content', 'Progress', 'Your data'];
  const cards = groups.map((name) =>
    page.locator('section').filter({
      has: page.getByRole('heading', { level: 2, name, exact: true }),
    }),
  );
  const positions = await Promise.all(cards.map((card) => card.boundingBox()));
  expect(positions[0]!.x).toBe(positions[1]!.x);
  expect(positions[1]!.y - positions[0]!.y - positions[0]!.height).toBe(20);
  expect(positions[2]!.x).toBe(positions[3]!.x);
  expect(positions[3]!.x).toBe(positions[4]!.x);
  expect(positions[2]!.x).toBeGreaterThan(positions[0]!.x + positions[0]!.width);
  for (const card of cards) {
    await expect(card).toHaveClass(/card-surface/);
    const heading = await card.getByRole('heading', { level: 2 }).boundingBox();
    const question = await card
      .getByRole('heading', { level: 3 })
      .first()
      .locator('button > span')
      .first()
      .boundingBox();
    expect(Math.abs(heading!.x - question!.x)).toBeLessThan(1);
  }
  await page.getByRole('button', { name: 'How do I create a course and lessons?' }).click();
  await page
    .getByRole('button', { name: 'What are the course path, checkpoints and Card practice?' })
    .click();
  for (let index = 0; index < cards.length; index++) {
    expect((await cards[index].boundingBox())!.x).toBe(positions[index]!.x);
  }
  await page.getByRole('button', { name: 'Which card type should I use?' }).click();
  await expect(page.getByLabel('Card examples')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search help' }).fill('picture sharing');
  await expect(page.getByText(/Share → Other ways → Course file/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Results' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(1);

  await page.goto('/#/help#occlusions');
  await expect(page.getByRole('button', { name: 'How do I make diagram cards?' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByText(/Upload a labelled diagram/)).toBeVisible();
  await page.getByRole('button', { name: 'How do I share a diagram with its image?' }).click();
  await expect(page.getByText(/Share → Other ways → Course file/)).toBeVisible();

  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/#/help');
  expect((await cards[2].boundingBox())!.x).toBeGreaterThan((await cards[0].boundingBox())!.x);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePositions = await Promise.all(cards.map((card) => card.boundingBox()));
  for (let index = 1; index < mobilePositions.length; index++) {
    expect(mobilePositions[index]!.x).toBe(mobilePositions[0]!.x);
    expect(mobilePositions[index]!.y).toBeGreaterThan(mobilePositions[index - 1]!.y);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.goto('/#/help#touch-gestures');
  const example = page.locator('#touch-gestures div[aria-hidden="true"]');
  await expect(example).toBeVisible();
  const bounds = (await example.boundingBox())!;
  for (const label of await example.locator(':scope > span').all()) {
    const box = (await label.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  }

  await page.setViewportSize({ width: 900, height: 900 });
  for (const route of ['/#/settings', '/#/help']) {
    await page.goto(route);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
