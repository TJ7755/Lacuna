import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { enterFreshLacuna } from './fixtures/lacunaApp';

// Regressions for #443: narrow, Larger-text diagram authoring keeps its dock inside the
// page frame, its focused fields clear of fixed chrome, and focus after deleting a region.
async function openNewOcclusion(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('lacuna-font-scale', '1.3');
    localStorage.setItem('lacuna-font-scale-user-set', '1');
  });
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.goto(`${page.url()}/cards`);
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page.getByRole('button', { name: 'More card types', exact: true }).click();
  await page
    .getByRole('group', { name: 'Card type', exact: true })
    .getByRole('button', { name: 'Image occlusion', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'New occlusion', exact: true })).toBeVisible();
  await page
    .getByLabel('Upload diagram', { exact: true })
    .setInputFiles(fileURLToPath(new URL('../../public/icons/icon-512.png', import.meta.url)));
  const canvas = page.getByRole('group', { name: 'Draw a region' });
  await expect(canvas).toBeVisible();
  return canvas;
}

async function drawBox(page: Page, name: string) {
  const canvas = page.getByRole('group', { name: 'Draw a region' });
  await canvas.focus();
  await canvas.press('Space');
  await canvas.press('Enter');
  await expect(page.getByRole('button', { name: `Delete ${name}` })).toBeVisible();
}

for (const width of [320, 390]) {
  test(`the occlusion dock stays inside the page frame at ${width}px with Larger text`, async ({
    page,
  }) => {
    await openNewOcclusion(page, width);
    const main = await page.locator('main').evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    expect(main.scroll).toBeLessThanOrEqual(main.client);
    const add = page.getByRole('button', { name: 'Add occlusion', exact: true });
    const lines = await add.evaluate((button) => {
      const range = document.createRange();
      range.selectNodeContents(button);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    expect(lines).toBe(1);
  });

  test(`deleting a region keeps focus and focused fields stay visible at ${width}px`, async ({
    page,
  }) => {
    await openNewOcclusion(page, width);
    await drawBox(page, 'Box 1');
    await drawBox(page, 'Box 2');
    await page.getByRole('button', { name: 'Delete Box 1' }).click();
    await expect(page.getByRole('button', { name: 'Delete Box 1' })).toBeFocused();

    await page.getByRole('button', { name: 'Delete Box 1' }).click();
    await expect(page.getByRole('group', { name: 'Draw a region' })).toBeFocused();

    await drawBox(page, 'Box 1');
    await page.getByRole('textbox', { name: /Answer text/ }).focus();
    await page.keyboard.press('Tab');
    const note = page.getByRole('textbox', { name: /Note on back/ });
    await expect(note).toBeFocused();
    const covered = await note.evaluate((field) => {
      const box = field.getBoundingClientRect();
      const blockers = [
        document.querySelector('[aria-label="Occlusion editor actions"] button'),
        ...document.querySelectorAll('nav'),
      ];
      return blockers.some((el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (
          r.width === 0 ||
          (getComputedStyle(el).position !== 'fixed' &&
            !el.closest('[aria-label="Occlusion editor actions"]'))
        )
          return false;
        return box.bottom > r.top && box.top < r.bottom && box.right > r.left && box.left < r.right;
      });
    });
    expect(covered).toBe(false);
  });
}
