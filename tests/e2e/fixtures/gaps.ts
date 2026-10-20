import type { Page } from '@playwright/test';

/** Gaps keeps its sidebar in a drawer below the desktop breakpoint, as Lacuna does. */
export async function openSidebarItem(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('complementary', { name: 'Gaps' }).getByRole('button', { name }).click();
}
