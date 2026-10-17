import { expect, test } from '@playwright/test';
import { chooseScheduledStudy, enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [1280, 390]) {
  test(`study timer stays fixed from notes through cards and step completion at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await enterFreshLacuna(page);
    await page.getByRole('button', { name: 'Study Welcome to Lacuna' }).click();
    await chooseScheduledStudy(page);

    const timer = page.getByRole('button', { name: 'Pomodoro timer', exact: true });
    const centre = () =>
      timer.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
    const notesCentre = await centre();
    const notesColumn = await page.locator('header > div').boundingBox();
    expect(notesColumn!.width).toBe(Math.min(width, 1152));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const card = page.locator('[data-study-card-id]');
    await expect(card).toBeVisible();
    await expect.poll(centre).toEqual(notesCentre);
    await expect(page.getByRole('button', { name: 'Exit', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Card actions', exact: true })).toBeVisible();

    const finished = page.getByRole('main', { name: 'Study progress' });
    for (let answered = 0; !(await finished.isVisible()); answered += 1) {
      expect(answered).toBeLessThan(20);
      const cardId = await card.getAttribute('data-study-card-id');
      await page.keyboard.press('Space');
      await expect(card.locator('[data-study-face="back"]')).toBeVisible();
      await page.keyboard.press('Y');
      await expect
        .poll(
          async () =>
            (await finished.isVisible()) ||
            ((await card.count()) === 1 &&
              (await card.getAttribute('data-study-card-id')) !== cardId),
        )
        .toBe(true);
    }
    await expect.poll(centre).toEqual(notesCentre);
  });
}
