import { expect, test } from '@playwright/test';
import { chooseScheduledStudy, enterFreshLacuna } from './fixtures/lacunaApp';

test('a keyboard-only learner moves from notes through a finished step without the mouse', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page.locator('main').getByRole('button', { name: 'Study' }).first().click();
  await chooseScheduledStudy(page);

  // The welcome course opens on its first lesson's notes.
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');

  const studyCard = page.locator('[data-study-card-id]:not([inert])');
  const finished = page.getByRole('main', { name: 'Study progress' });
  await expect(studyCard).toBeVisible();
  // The first step is a handful of cards; answer each by keyboard until it completes.
  for (let answered = 0; !(await finished.isVisible()); answered += 1) {
    expect(answered).toBeLessThan(20);
    const cardId = await studyCard.getAttribute('data-study-card-id');
    await page.keyboard.press('Space');
    await expect(studyCard.locator('[data-study-face="back"]')).toBeVisible();
    await page.keyboard.press('Y');
    await expect
      .poll(async () => {
        if (await finished.isVisible()) return true;
        // The outgoing card overlaps its replacement; read the active identity atomically.
        return studyCard.evaluateAll(
          (cards, previousId) =>
            cards.length === 1 && cards[0].getAttribute('data-study-card-id') !== previousId,
          cardId,
        );
      })
      .toBe(true);
  }

  await expect(finished.getByRole('button', { name: /^Continue/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(finished).toBeHidden();
});
