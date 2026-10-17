import { expect, test, type Locator } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('Tab leaves Other ways from its trigger in both directions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Other ways to study' });
  for (const [key, target] of [
    ['Tab', 'Add'],
    ['Shift+Tab', 'Study'],
  ] as const) {
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu', { name: 'Other ways to study' })).toBeVisible();
    await page.keyboard.press(key);
    await expect(page.getByRole('menu', { name: 'Other ways to study' })).toBeHidden();
    await expect(page.getByRole('button', { name: target, exact: true })).toBeFocused();
  }
});

async function assertPanelContained(trigger: Locator, menu: Locator) {
  const panel = (await menu.boundingBox())!;
  const surface = (await trigger.locator('..').boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(surface.x - 1);
  expect(panel.y).toBeGreaterThanOrEqual(surface.y - 1);
  expect(panel.x + panel.width).toBeLessThanOrEqual(surface.x + surface.width + 1);
  expect(panel.y + panel.height).toBeLessThanOrEqual(surface.y + surface.height + 1);
}

for (const width of [390, 1440]) {
  test(`Add and Other ways share accessible expanding surfaces at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
      .click();
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    for (const label of ['Add', 'Other ways to study']) {
      const trigger = page.getByRole('button', { name: label, exact: true });
      await expect(trigger).toBeVisible();
      const closedFont = await trigger.evaluate((element) => getComputedStyle(element).fontSize);
      const closed = (await trigger.locator('..').boundingBox())!;
      await trigger.focus();
      await page.keyboard.press('ArrowDown');
      const menu = page.getByRole('menu', { name: label, exact: true });
      const enabled = menu.locator('[role="menuitem"]:not(:disabled)');
      await expect(menu).toBeVisible();
      await expect(enabled.first()).toBeFocused();
      await assertPanelContained(trigger, menu);
      const opened = (await trigger.locator('..').boundingBox())!;
      expect(Math.abs(opened.x + opened.width - closed.x - closed.width)).toBeLessThanOrEqual(1);
      expect(await trigger.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
        closedFont,
      );
      expect(opened.height).toBeGreaterThan(closed.height);
      expect(opened.x).toBeGreaterThanOrEqual(0);
      expect(opened.x + opened.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('End');
      await expect(enabled.last()).toBeFocused();
      await page.keyboard.press('Home');
      await expect(enabled.first()).toBeFocused();
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`${label.replaceAll(' ', '-')}-${width}.png`),
      });
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(menu).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });
}

test('New course icon and label stay centred as one group at enlarged text size', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = '20px'));
  const trigger = page.locator('main').getByRole('button', { name: 'New course', exact: true });
  const geometry = await trigger.evaluate((button) => {
    const icon = button.querySelector('svg')!.getBoundingClientRect();
    const text = button.lastElementChild!.getBoundingClientRect();
    const surface = button.parentElement!.getBoundingClientRect();
    return {
      offset: Math.abs((icon.left + text.right - surface.left - surface.right) / 2),
      contained: icon.left >= surface.left && text.right <= surface.right,
    };
  });
  expect(geometry.offset).toBeLessThanOrEqual(1);
  expect(geometry.contained).toBe(true);
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('new-course-enlarged.png'),
  });
});

test('expanding menus animate their own geometry and settle without clipping', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
  for (const label of ['Add', 'Other ways to study']) {
    const trigger = page.getByRole('button', { name: label, exact: true });
    const samples = await trigger.evaluate(async (button) => {
      const surface = button.parentElement!;
      const before = surface.getBoundingClientRect().width;
      (button as HTMLButtonElement).click();
      const widths: number[] = [];
      const start = performance.now();
      while (performance.now() - start < 700) {
        await new Promise(requestAnimationFrame);
        widths.push(surface.getBoundingClientRect().width);
      }
      return { before, widths, after: surface.getBoundingClientRect().width };
    });
    expect(samples.widths.length).toBeGreaterThan(5);
    expect(samples.after).toBeGreaterThan(samples.before + 10);
    expect(
      samples.widths.some((width) => width > samples.before + 1 && width < samples.after - 1),
    ).toBe(true);
    expect(Math.abs(samples.widths.at(-1)! - samples.after)).toBeLessThanOrEqual(1);
    await assertPanelContained(trigger, page.getByRole('menu', { name: label, exact: true }));
    await trigger.focus();
    await page.keyboard.press('Escape');
  }
});

for (const width of [390, 1440]) {
  test(`morphing triggers retain resting bounds on hover and press at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await enterFreshLacuna(page);
    async function pressAtRest(trigger: Locator) {
      await trigger.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await page.waitForTimeout(250);
      const rest = (await trigger.boundingBox())!;
      await trigger.hover();
      await page.waitForTimeout(180);
      const hovered = (await trigger.boundingBox())!;
      await page.mouse.down();
      await page.waitForTimeout(180);
      const held = (await trigger.boundingBox())!;
      const opensStudy = (await trigger.getAttribute('data-study-trigger')) !== null;
      if (opensStudy) {
        await trigger.evaluate(() => {
          sessionStorage.removeItem('test-study-morph-origin');
          const observer = new MutationObserver(() => {
            const surface = document.querySelector('[data-expanding-action="study"]');
            if (!surface) return;
            sessionStorage.setItem(
              'test-study-morph-origin',
              JSON.stringify(surface.getBoundingClientRect()),
            );
            observer.disconnect();
          });
          observer.observe(document.body, { childList: true, subtree: true });
        });
      }
      for (const bounds of [hovered, held]) {
        expect(Math.abs(bounds.width - rest.width)).toBeLessThan(0.1);
        expect(Math.abs(bounds.height - rest.height)).toBeLessThan(0.1);
        // Today's row has its own deliberate 2px hover lift; the pill must not resize.
        expect(Math.abs(bounds.x - rest.x)).toBeLessThan(0.1);
        const liftsRow =
          (await trigger.getAttribute('data-study-trigger')) !== null &&
          (await trigger.getAttribute('aria-label')) !== null;
        expect(Math.abs(bounds.y - rest.y)).toBeLessThan(liftsRow ? 2.1 : 0.1);
      }
      await page.mouse.up();
      if (opensStudy) {
        const readOrigin = () =>
          page.evaluate(() => sessionStorage.getItem('test-study-morph-origin'));
        await expect.poll(readOrigin).not.toBeNull();
        const origin = JSON.parse((await readOrigin())!);
        for (const key of ['x', 'y', 'width', 'height'] as const)
          expect(Math.abs(origin[key] - held[key])).toBeLessThan(0.1);
      }
    }
    for (const label of ['New course', 'Import']) {
      await pressAtRest(page.locator('main').getByRole('button', { name: label, exact: true }));
      if (label === 'New course') await page.keyboard.press('Escape');
      else await page.locator('main').getByRole('button', { name: 'Close', exact: true }).click();
      await page.waitForTimeout(600);
    }
    await pressAtRest(page.getByRole('button', { name: 'Study Welcome to Lacuna' }));
    await page.getByRole('region', { name: 'Session preview' }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
      .click();
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
    for (const label of ['Study', 'Other ways to study', 'Add']) {
      await pressAtRest(page.getByRole('button', { name: label, exact: true }));
      if (label === 'Study') await page.getByRole('region', { name: 'Session preview' }).waitFor();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }
  });
}
