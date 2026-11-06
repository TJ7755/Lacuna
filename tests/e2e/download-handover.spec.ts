import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

for (const platform of [
  {
    name: 'Windows',
    compatibility: '64-bit Windows · installer',
    updates: 'Automatic updates',
    alternative: 'Windows portable · manual updates',
    extension: /Lacuna-Setup-[\d.]+\.exe$/,
  },
  {
    name: 'macOS',
    compatibility: 'Apple Silicon only',
    updates: 'Manual updates',
    alternative: null,
    extension: /Lacuna-[\d.]+-arm64\.dmg$/,
  },
  {
    name: 'Linux',
    compatibility: '64-bit Linux · AppImage',
    updates: 'Automatic updates',
    alternative: 'Debian / Ubuntu DEB · manual updates',
    extension: /Lacuna-[\d.]+\.AppImage$/,
  },
]) {
  test(`${platform.name} exposes installation expectations and handover before help`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/download');
    await page.getByRole('button', { name: platform.name, exact: true }).click();
    await expect(page.getByRole('button', { name: platform.name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      page.getByRole('link', { name: `Download for ${platform.name}`, exact: true }),
    ).toHaveAttribute('href', platform.extension);
    await expect(page.getByText(platform.compatibility, { exact: true })).toBeInViewport();
    await expect(page.getByText(platform.updates, { exact: true })).toBeInViewport();
    await expect(page.getByText(/Prerelease · v/)).toBeInViewport();
    await expect(page.getByText('Managed computers may block installation.')).toBeInViewport();
    await expect(page.getByText('Browser data is not copied automatically.')).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Back up in browser' })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole('button', { name: 'Installation help' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    if (platform.alternative)
      await expect(page.getByRole('link', { name: platform.alternative })).toBeInViewport();
    if (platform.name !== 'Linux')
      await expect(page.getByText('Unsigned', { exact: true })).toBeInViewport();
    for (const action of await page.locator('a, button').all()) {
      expect(
        await action.evaluate((element) => element.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`download-${platform.name.toLowerCase()}.png`),
    });
    if (platform.name === 'Windows') {
      await page.getByRole('button', { name: 'Installation help' }).click();
      await expect(page.getByRole('region', { name: 'Installation help' })).toContainText(
        'Run anyway only when you downloaded Lacuna',
      );
      await page.screenshot({
        path: test.info().outputPath('download-installation-help.png'),
        fullPage: true,
      });
    }
  });
}

test('an unsupported device keeps platform selection explicit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'userAgent', { value: 'Unknown device' }),
  );
  await page.goto('/#/download');
  await expect(page.getByText('Choose your computer.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Installation help' })).toBeDisabled();
  await expect(page.getByRole('link', { name: /Download for/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back up in browser' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('download-choose-platform.png') });
});

test('the browser handover opens the real full-backup action without losing local courses', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterWithWelcomeCourse(page);
  await page.goto('/#/download');
  await page.getByRole('link', { name: 'Back up in browser' }).click();
  await expect(page).toHaveURL(/#\/settings#settings-export$/);
  const exportSection = page.locator('#settings-export');
  await expect(
    exportSection.getByRole('heading', { name: 'Full backup and recovery' }),
  ).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportSection.getByRole('button', { name: 'Download full backup', exact: true }).click(),
  ]);
  const backupPath = await download.path();
  if (!backupPath) throw new Error('Expected browser backup file');
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  expect(backup.courses).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'Welcome to Lacuna' })]),
  );
  expect(backup.cards.length).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('browser-backup-handover.png') });
});
