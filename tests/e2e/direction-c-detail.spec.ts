import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function openWelcomeCourse(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  return new URL(page.url()).hash.slice(1);
}

const box = async (locator: Locator) => (await locator.boundingBox())!;

test('path lesson names keep whole words on a phone in Edit mode', async ({ page }) => {
  await openWelcomeCourse(page, 390);
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
  await expect(page.locator('button .line-clamp-2.font-bold').first()).toBeVisible();
  // Squeezed beside the counts and the actions menu, names broke mid-word ("Biologic al").
  const widths = await page
    .locator('button .line-clamp-2.font-bold')
    .evaluateAll((names) => names.map((name) => name.getBoundingClientRect().width));
  expect(widths.length).toBeGreaterThan(0);
  for (const width of widths) expect(width).toBeGreaterThanOrEqual(127);
});

test('the Cards header keeps New card as its single 44px authoring entry', async ({ page }) => {
  const course = await openWelcomeCourse(page, 1440);
  await page.goto(`/#${course}/cards`);
  const header = page.locator('main header').filter({
    has: page.getByRole('heading', { name: 'Cards', exact: true }),
  });
  const newCard = header.getByRole('button', { name: 'New card', exact: true });
  await expect(header.getByRole('button')).toHaveCount(1);
  expect(Math.round((await box(newCard)).height)).toBe(44);
  await newCard.click();
  await expect(page.getByRole('group', { name: 'Card type', exact: true })).toBeVisible();
});

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
