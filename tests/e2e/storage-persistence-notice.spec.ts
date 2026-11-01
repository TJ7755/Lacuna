import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

for (const state of ['non-persistent', 'persisted', 'unsupported'] as const) {
  test(`${state} storage keeps startup clear and offers guidance only in Settings`, async ({
    page,
  }, testInfo) => {
    // Phones are not a product target (CONTRIBUTING.md); check the desktop first screen.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((state) => {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value:
          state === 'unsupported'
            ? undefined
            : {
                persist: async () => state === 'persisted',
                persisted: async () => state === 'persisted',
                estimate: async () => ({}),
              },
      });
    }, state);
    await enterWithWelcomeCourse(page);
    const notifications = page.getByLabel('Notifications', { exact: true });
    await expect(notifications.getByRole('link')).toHaveCount(0);
    await expect(page.getByRole('note', { name: 'Browser storage' })).toHaveCount(0);
    const queue = page.getByRole('region', { name: 'Today, most urgent first' });
    const study = queue.getByRole('button', { name: /^Study / }).first();
    await expect(study).toBeVisible();
    const bounds = (await study.boundingBox())!;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(800);
    expect(
      await study.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit !== null && button.contains(hit);
      }),
    ).toBe(true);
    if (state === 'non-persistent') {
      await page.screenshot({
        path: testInfo.outputPath('today-desktop.png'),
        animations: 'disabled',
      });
    }

    await page.goto('/#/settings#settings-backups');
    const backups = page.locator('#settings-backups');
    await expect(backups).toBeInViewport();
    const note = backups.getByRole('note', { name: 'Browser storage' });
    if (state !== 'non-persistent') {
      // Wait for the asynchronous storage read before checking the note's absence.
      await expect(
        backups.getByText(
          state === 'persisted'
            ? 'Storage is persisted'
            : 'This browser does not support persistent storage.',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(note).toHaveCount(0);
      return;
    }

    await expect(note).toBeVisible();
    await note.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('settings-phone.png'),
      animations: 'disabled',
    });
    await note.getByRole('link', { name: 'Device sync', exact: true }).click();
    await expect(page).toHaveURL(/#\/settings#settings-sync$/);
    await expect(page.locator('#settings-sync')).toBeInViewport();
    await note.getByRole('link', { name: 'Backups', exact: true }).click();
    await expect(page).toHaveURL(/#\/settings#settings-backups$/);
    await expect(backups).toBeInViewport();
    await page.reload();
    await expect(note).toBeVisible();
    await expect(notifications.getByRole('link')).toHaveCount(0);
  });
}
