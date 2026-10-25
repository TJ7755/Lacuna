import { expect, test, type Page } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

async function openWelcomeCourse(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  return new URL(page.url()).hash.slice(1);
}

test('card rows show maths whole and cloze answers without stray spaces', async ({ page }) => {
  const course = await openWelcomeCourse(page, 1440);
  await page.goto(`/#${course}/cards`);
  // Its answer opens with a fraction, taller than a line of text.
  const answer = page
    .locator('[data-card-id]', { hasText: 'What is the derivative of' })
    .locator('[data-card-answer]');
  await expect(answer).toBeVisible();
  const fraction = await answer.evaluate((element) => {
    const outer = element.getBoundingClientRect();
    const inner = element.querySelector('.mfrac')!.getBoundingClientRect();
    return { top: inner.top - outer.top, bottom: outer.bottom - inner.bottom };
  });
  expect(fraction.top).toBeGreaterThanOrEqual(-0.5);
  expect(fraction.bottom).toBeGreaterThanOrEqual(-0.5);
  const reveal = page.locator('[data-card-answer] .cloze-reveal').first();
  expect(
    await reveal.evaluate((element) => {
      const style = getComputedStyle(element);
      return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    }),
  ).toBe(0);
});

test("a lesson's card list renders maths as the Cards page does", async ({ page }) => {
  await openWelcomeCourse(page, 1440);
  await page.getByRole('button', { name: 'Core concepts & rendering', exact: true }).click();
  const list = page.getByRole('complementary').filter({ hasText: 'Cards in this lesson' });
  const row = list.getByRole('listitem').filter({ hasText: 'What is the derivative of' });
  await expect(row.locator('.katex').first()).toBeVisible();
  // KaTeX keeps the source in hidden MathML; outside the maths, no raw notation is left.
  expect(
    await row.evaluate((element) => {
      const copy = element.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.katex').forEach((maths) => maths.remove());
      return copy.textContent;
    }),
  ).not.toContain('^');
});
