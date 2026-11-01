import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`landing previews use local images without video requests at ${width}px`, async ({
    page,
  }) => {
    const mediaRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('.mp4') || url.hostname.endsWith('.blob.vercel-storage.com')) {
        mediaRequests.push(request.url());
      }
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/landing');

    for (const [name, path] of [
      [/Lacuna revision dashboard/, '/landing/films/student.webp'],
      [/Gaps class report/, '/landing/films/gaps.webp'],
    ] as const) {
      const image = page.getByRole('img', { name });
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect(image).toHaveAttribute('src', path);
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
    await expect(page.locator('.landing-film video')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Watch/ })).toHaveCount(0);
    expect(mediaRequests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole('link', { name: 'Open Gaps' }).focus();
    await expect(page.getByRole('link', { name: 'Open Gaps' })).toBeFocused();
    await page.screenshot({ path: test.info().outputPath(`previews-${width}.png`) });
  });
}
