import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

test('edits a checkpoint in place, excludes a card and persists a dragged anchor', async ({
  page,
}) => {
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('navigation', { name: 'Courses' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit mode' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Checkpoint', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add checkpoint' });
  await editor.getByRole('textbox', { name: 'Name' }).fill('Mid-course check');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor).toBeHidden();
  const row = page.getByRole('button', { name: 'Edit checkpoint: Mid-course check', exact: true });
  await row.click();
  for (const value of ['', 'Discard this name']) {
    for (const method of ['escape', 'outside', 'cancel']) {
      await page.getByRole('textbox', { name: 'Name' }).fill(value);
      if (method === 'escape') await page.keyboard.press('Escape');
      else if (method === 'outside')
        await page.locator('[data-path-editor-backdrop]').click({ position: { x: 4, y: 4 } });
      else await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(row).toBeFocused();
      await row.click();
      await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Mid-course check');
    }
  }
  const exclusion = page.getByRole('button', { name: 'Leave some cards out' });
  await expect(exclusion).toBeVisible();
  const alignment = await exclusion.evaluate((button) => ({
    left: button.getBoundingClientRect().left,
    padding: getComputedStyle(button).paddingLeft,
    summaryLeft: button.parentElement!.previousElementSibling!.getBoundingClientRect().left,
  }));
  expect(alignment.left).toBe(alignment.summaryLeft);
  expect(alignment.padding).toBe('0px');
  await page.screenshot({ path: 'artifacts/path-editor-dismiss.png' });
  await page.getByRole('textbox', { name: 'Name' }).fill('Paper one');
  await page.getByRole('button', { name: 'Leave some cards out' }).click();
  const picker = page.getByRole('dialog', { name: 'Excluded cards' });
  const card = picker.getByRole('button', {
    name: 'What does the forgetting curve describe?',
    exact: true,
  });
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '1 card', exact: true })).toBeVisible();
  await card.press('Escape');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const edited = page.getByRole('button', { name: 'Edit checkpoint: Paper one', exact: true });
  await expect(edited).toBeVisible();
  await edited.scrollIntoViewIfNeeded();
  const source = (await edited.boundingBox())!;
  const second = page.getByRole('button', { name: 'Scheduling philosophy', exact: true });
  await edited.evaluate((button) => {
    const frames: number[] = [];
    (window as Window & { pathDropFrames?: number[] }).pathDropFrames = frames;
    button.addEventListener(
      'pointerup',
      () => {
        const sample = () => {
          frames.push((button.closest('li') ?? button).getBoundingClientRect().top);
          if (frames.length < 45) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      },
      { once: true },
    );
  });
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await expect(edited).toHaveAttribute('data-drag-lifted', 'true');
  const target = (await second.boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height - 4, { steps: 20 });
  // Holding near the viewport edge can scroll the path during the drag.
  const releaseTarget = (await second.boundingBox())!;
  await page.mouse.move(
    releaseTarget.x + releaseTarget.width / 2,
    releaseTarget.y + releaseTarget.height - 4,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { pathDropFrames?: number[] }).pathDropFrames?.length ?? 0,
      ),
    )
    .toBe(45);
  const frames = await page.evaluate(
    () => (window as Window & { pathDropFrames?: number[] }).pathDropFrames!,
  );
  expect(
    Math.max(...frames.slice(1).map((top, index) => Math.abs(top - frames[index]))),
  ).toBeLessThan(32);
  const path = page.getByRole('list', { name: 'Course path' });
  await expect(path.getByRole('listitem').nth(2)).toContainText('Paper one');
  await page.reload();
  await expect(
    page.getByRole('list', { name: 'Course path' }).getByRole('listitem').nth(2),
  ).toContainText('Paper one');
  await page.getByRole('button', { name: 'Edit checkpoint: Paper one', exact: true }).click();
  await expect(page.getByRole('button', { name: '1 card', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
});
