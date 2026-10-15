import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const theme of ['light', 'dark']) {
  test(`Volt keeps text, actions and focus legible in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('lacuna-theme', value), theme);
    await enterFreshLacuna(page);
    const palette = await page.evaluate(() => {
      const probe = document.createElement('span');
      document.body.append(probe);
      function rgb(token: string) {
        probe.style.color = `hsl(var(--${token}))`;
        return getComputedStyle(probe).color.match(/[\d.]+/g)!.map(Number).slice(0, 3);
      }
      function luminance(colour: number[]) {
        return colour.map((value) => {
          const c = value / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      }
      function contrast(a: string, b: string) {
        const values = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
        return (values[0] + 0.05) / (values[1] + 0.05);
      }
      const text = ['paper', 'surface', 'surface-raised', 'chrome'].flatMap((background) =>
        ['ink', 'ink-soft', 'ink-faint', 'accent-ink', 'positive', 'negative', 'warning-fg']
          .map((foreground) => ({ pair: `${foreground}/${background}`, ratio: contrast(foreground, background) })),
      );
      const action = contrast('accent-fg', 'accent');
      const accent = rgb('accent');
      const focus = contrast('accent-ink', 'paper');
      probe.remove();
      return { text, action, accent, focus };
    });
    for (const sample of palette.text) expect(sample.ratio, sample.pair).toBeGreaterThanOrEqual(4.5);
    expect(palette.action).toBeGreaterThanOrEqual(4.5);
    expect(palette.focus).toBeGreaterThanOrEqual(3);
    expect(palette.accent[1]).toBeGreaterThan(palette.accent[0]);
    expect(palette.accent[1]).toBeGreaterThan(palette.accent[2] * 2);
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
    const accentControl = page.getByRole('radio', { name: 'Volt', exact: true });
    await page.keyboard.press('Tab');
    await accentControl.focus();
    const ring = await accentControl.evaluate((button) => {
      const probe = document.createElement('span');
      probe.style.color = 'hsl(var(--accent-ink))';
      button.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return { shadow: getComputedStyle(button).boxShadow, colour };
    });
    expect(ring.shadow).toContain(ring.colour);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => [...document.fonts]
      .filter((face) => ['Space Grotesk', 'Instrument Sans'].includes(face.family))
      .map((face) => `${face.family}:${face.status}`).sort()),
    ).toEqual(['Instrument Sans:loaded', 'Space Grotesk:loaded']);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content',
      theme === 'dark' ? 'hsl(90 10% 4%)' : 'hsl(82 30% 94%)');
  });
}

test('adopts the old amber default once and retains a later deliberate Amber choice', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('lacuna-accent', 'amber');
    localStorage.removeItem('lacuna-volt-accent-adopted');
    localStorage.setItem('lacuna-theme', 'light');
  });
  await page.goto('/#/settings');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Volt', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Light', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'Amber', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Amber', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Amber', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Light', exact: true })).toHaveAttribute('aria-checked', 'true');
});
