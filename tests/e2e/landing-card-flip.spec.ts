import { expect, test } from '@playwright/test';

test('clicked journey cards retain manual control while untouched cards follow scrolling', async ({ page }) => {
  await page.goto('/#/landing');
  const examples = page.locator('.journey-example');
  const recall = examples.nth(1);
  const practice = examples.nth(2);
  const scroll = async (index: number, offset: number) => {
    await examples.nth(index).evaluate((node, amount) => {
      window.scrollTo({ top: scrollY + node.getBoundingClientRect().top + innerHeight * amount, behavior: 'instant' });
    }, offset);
  };
  const card = recall.getByRole('button', { name: 'What does a derivative measure?' });
  await scroll(1, -0.2);
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  const rotation = () => card.locator('.journey-card-turn').evaluate(
    (node) => new DOMMatrix(getComputedStyle(node).transform).m11,
  );
  await expect.poll(rotation).toBeCloseTo(-1, 3);
  await card.press('Space');
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await scroll(1, 0.2);
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(rotation).toBeCloseTo(1, 3);
  const untouched = practice.getByRole('button', { name: 'If f(x) = eˣ, what is f′(0)?' });
  await scroll(2, -0.2);
  await expect(untouched).toHaveAttribute('aria-pressed', 'false');
  await scroll(2, 0.2);
  await expect(untouched).toHaveAttribute('aria-pressed', 'true');
  await untouched.press('Enter');
  await expect(untouched).toHaveAttribute('aria-pressed', 'false');
  await scroll(2, -0.2);
  await scroll(2, 0.2);
  await expect(untouched).toHaveAttribute('aria-pressed', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await untouched.press('Enter');
  await expect(untouched).toHaveAttribute('aria-pressed', 'true');
  await expect(untouched.locator('.journey-card-turn')).toHaveCSS('transform', 'none');
  await expect(untouched.locator('.journey-answer')).toBeVisible();
});
