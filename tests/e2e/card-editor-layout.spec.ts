import { expect, test, type Locator } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function bounds(control: Locator) {
  return control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const fixed =
      getComputedStyle(element.closest('[aria-label="Card editor actions"]') ?? element)
        .position === 'fixed';
    return {
      x: box.x,
      y: box.y + (fixed ? 0 : (element.closest('main')?.scrollTop ?? 0)),
      width: box.width,
      height: box.height,
    };
  });
}

for (const width of [320, 390, 768, 1063, 1440]) {
  for (const scale of [1, 1.3]) {
    for (const mode of ['keyboard', 'touch'] as const) {
      test(`card editor fits ${width}px, ${scale === 1 ? 'Default' : 'Larger'} text, ${mode}`, async ({
        page,
      }, testInfo) => {
        test.setTimeout(90_000);
        const theme = mode === 'touch' ? 'light' : 'dark';
        // Course setup uses its desktop navigation; geometry is measured at the target width.
        await page.setViewportSize({ width: 1440, height: 812 });
        await page.emulateMedia({
          reducedMotion: scale === 1 ? 'no-preference' : 'reduce',
          colorScheme: theme,
        });
        await page.addInitScript(
          ({ mode, scale, theme }) => {
            localStorage.setItem('lacuna.inputMode', mode);
            localStorage.setItem('lacuna-font-scale', String(scale));
            localStorage.setItem('lacuna-font-scale-user-set', '1');
            localStorage.setItem('lacuna-theme', theme);
          },
          { mode, scale, theme },
        );
        await enterFreshLacuna(page);
        await createCourse(page, 'Editor layout');
        await page.getByRole('button', { name: 'New card', exact: true }).first().click();
        await page.setViewportSize({ width, height: 812 });
        const front = page.getByRole('textbox', { name: 'Front', exact: true });
        const back = page.getByRole('textbox', { name: 'Back', exact: true });
        await front.fill('First question');
        await back.fill('First answer');
        await page.evaluate(() => document.fonts.ready);

        const actions = page.getByRole('region', { name: 'Card editor actions' });
        await expect(actions.locator('../..')).toHaveCSS('transform', 'none');
        await actions.scrollIntoViewIfNeeded();
        const repeat = actions.getByRole('button', { name: 'Save & add another' });
        const add = actions.getByRole('button', { name: 'Add card', exact: true });
        const cancel = actions.getByRole('button', { name: 'Cancel', exact: true });
        const label = await repeat.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const lines = [...range.getClientRects()];
          const box = element.getBoundingClientRect();
          return {
            lines: lines.length,
            inset: Math.min(lines[0].top - box.top, box.bottom - lines.at(-1)!.bottom),
          };
        });
        await page.screenshot({ path: testInfo.outputPath('actions-before.png') });
        expect(label.lines).toBe(1);
        expect(label.inset).toBeGreaterThanOrEqual(7);
        expect((await bounds(cancel)).height).toBeLessThanOrEqual(64);
        if (mode === 'touch') expect((await bounds(actions)).height).toBeLessThan(200);

        // From lg the actions sit in a sticky column, whose page offset follows the scroll
        // position, so compare both measurements from the top of the page.
        const scrollToTop = () => page.locator('main').evaluate((main) => main.scrollTo(0, 0));
        await scrollToTop();
        const before = {
          repeat: await bounds(repeat),
          add: await bounds(add),
          cancel: await bounds(cancel),
        };
        for (let entry = 1; entry <= 2; entry++) {
          await repeat.click();
          await expect(front).toHaveValue('');
          await expect(actions.getByText(`${entry} added`, { exact: true })).toBeVisible();
          await front.fill(`Question ${entry + 1}`);
          await back.fill(`Answer ${entry + 1}`);
        }
        await scrollToTop();
        // Compare settled targets rather than the shared Button's deliberate hover scale.
        await page.mouse.move(0, 0);
        await expect
          .poll(async () => Math.abs((await bounds(repeat)).width - before.repeat.width))
          .toBeLessThan(1.5);
        for (const [name, control] of [
          ['repeat', repeat],
          ['add', add],
          ['cancel', actions.getByRole('button', { name: 'Done' })],
        ] as const) {
          // Poll each target: a sibling's press or hover spring can still be settling here.
          for (const axis of ['x', 'y', 'width', 'height'] as const)
            await expect
              .poll(async () => Math.abs((await bounds(control))[axis] - before[name][axis]), {
                message: `${name} ${axis}`,
              })
              .toBeLessThan(1.5);
          expect((await bounds(control)).height).toBeGreaterThanOrEqual(44);
        }

        const answer = page.getByRole('combobox', { name: 'Card answer mode' });
        await answer.scrollIntoViewIfNeeded();
        const answerLabel = await answer.evaluate((element) => {
          const label = element.closest('label')!;
          const range = document.createRange();
          range.selectNodeContents(label.firstChild!);
          return {
            labelBottom: range.getBoundingClientRect().bottom,
            controlTop: element.getBoundingClientRect().top,
          };
        });
        expect(answerLabel.controlTop - answerLabel.labelBottom).toBeGreaterThanOrEqual(4);
        const selectedText = await answer.evaluate((element) => {
          const style = getComputedStyle(element);
          const canvas = document.createElement('canvas').getContext('2d')!;
          canvas.font = style.font;
          return {
            width: canvas.measureText((element as HTMLSelectElement).selectedOptions[0].text).width,
            available:
              element.clientWidth -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight) -
              24,
          };
        });
        expect(selectedText.width).toBeLessThanOrEqual(selectedText.available);
        const reverse = page.getByRole('button', { name: 'Also create reverse' });
        await expect(reverse).toHaveAttribute('aria-pressed', 'false');
        await reverse.click();
        await expect(reverse).toHaveAttribute('aria-pressed', 'true');
        await reverse.focus();
        await page.screenshot({ path: testInfo.outputPath('options-on.png') });
        await reverse.click();
        await expect(reverse).toHaveAttribute('aria-pressed', 'false');

        for (const field of [front, back]) {
          const toolbar = field
            .locator('..')
            .locator('..')
            .locator('..')
            .locator('> div')
            .filter({ has: page.getByRole('button', { name: 'Bold', exact: true }) });
          await expect(toolbar).toHaveCount(1);
          await toolbar.scrollIntoViewIfNeeded();
          const rows = await toolbar
            .locator('button:visible')
            .evaluateAll((buttons) =>
              buttons.map((button) => Math.round(button.getBoundingClientRect().y)),
            );
          expect(new Set(rows).size).toBe(1);
          const more = toolbar.getByRole('button', { name: 'More formatting' });
          await more.click();
          await expect(
            toolbar.getByRole('button', { name: 'Block maths', exact: true }),
          ).toBeVisible();
          await expect(toolbar.getByRole('button', { name: 'Heading', exact: true })).toBeVisible();
          await more.click();
          await expect(toolbar.getByRole('button', { name: 'Heading', exact: true })).toHaveCount(
            0,
          );
        }
        await front.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath('editor.png') });
        if (mode === 'touch' && width <= 390) {
          // A resized visual viewport exercises the dock when a keyboard reduces usable height.
          await page.setViewportSize({ width, height: 480 });
          await front.focus();
          const dock = await bounds(actions);
          expect(dock.y).toBeGreaterThan(150);
          expect(dock.y + dock.height).toBeLessThanOrEqual(480);
          await page.screenshot({ path: testInfo.outputPath('keyboard-height.png') });
        }
        const geometry = await actions.evaluate((element) => ({
          dock: element.getBoundingClientRect().toJSON(),
          scrollWidth: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }));
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport);
        await testInfo.attach('geometry', {
          body: JSON.stringify({ before, label, geometry }, null, 2),
          contentType: 'application/json',
        });
      });
    }
  }
}
