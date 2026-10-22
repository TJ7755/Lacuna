import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Gaps opens the teacher entry on a first visit at ${viewport.width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    // Serve the candidate build under the real hostname without publishing it.
    await page.context().route('https://gaps.getlacuna.app/**', async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('https://gaps.getlacuna.app/?source=trial');
    await expect(page).toHaveURL('https://gaps.getlacuna.app/?source=trial#/teach');
    await expect(page.getByRole('heading', { name: 'Gaps', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No published courses here' })).toBeVisible();
    await page.getByText('About daily reports and pupil privacy', { exact: true }).click();
    await expect(
      page.getByText(/Reporting requires an enabled pupil build and relay/),
    ).toBeVisible();
    await expect(page.getByText(/Pupils choose whether to share results/)).toBeVisible();
    await expect(page.locator('.landing-page')).toHaveCount(0);
    await expect(page).toHaveTitle('Gaps · Lacuna');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('gaps-entry.png'), fullPage: true });

    await expect(page.getByRole('link', { name: 'Open sharing on the main site' })).toHaveAttribute(
      'href',
      'https://getlacuna.app/#/share',
    );
    await page.goto('https://gaps.getlacuna.app/#/share');
    await expect(page.getByRole('heading', { name: 'Share', exact: true })).toBeVisible();
    // Class insights opens Gaps itself in a new tab.
    const insights = page.getByRole('link', { name: 'Class insights', exact: true });
    await expect(insights).toHaveAttribute('href', 'https://gaps.getlacuna.app');
    const [gaps] = await Promise.all([page.waitForEvent('popup'), insights.click()]);
    gaps.on('pageerror', (error) => errors.push(error.message));
    await expect(gaps.getByRole('heading', { name: 'Gaps', exact: true })).toBeVisible();

    await gaps.reload();
    await expect(gaps.getByRole('heading', { name: 'Gaps', exact: true })).toBeVisible();
    await expect(gaps).toHaveURL('https://gaps.getlacuna.app/#/teach');
    expect(errors).toEqual([]);
  });
}
