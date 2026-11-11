import { expect, test } from '@playwright/test';
import type { CourseAssessment, Lesson } from '@lacuna/core/db/types';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`imported assessment expands, edits and removes its date with ${reducedMotion} motion`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion });
    await enterWithWelcomeCourse(page);
    await page
      .getByRole('complementary')
      .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
      .click();
    const original = (await readAll<CourseAssessment>(page, 'courseAssessments')).find(
      (entry) => entry.kind === 'final',
    )!;
    const lessons = await readAll<Lesson>(page, 'lessons');
    const assessments = page.getByRole('region', { name: 'Assessments', exact: true });
    const row = assessments.locator('button[data-path-row]').filter({ hasText: original.name });
    await row.click();
    const details = page.getByRole('dialog', { name: `${original.name} details`, exact: true });
    await expect(details).toBeVisible();
    await expect.poll(async () => Math.round((await details.boundingBox())!.width)).toBe(520);
    await expect(details.getByRole('textbox', { name: 'Name', exact: true })).toHaveCount(0);
    for (const lesson of lessons)
      await expect(details.getByText(lesson.name, { exact: true })).toBeVisible();
    const bounds = await details.boundingBox();
    expect(bounds!.width).toBeLessThan(800);
    expect(bounds!.height).toBeLessThan(600);
    expect(bounds!.x).toBeGreaterThan(500);
    await page.screenshot({
      path: info.outputPath('assessment-expanded.png'),
      animations: 'disabled',
    });

    await details.getByRole('button', { name: 'Choose date and time', exact: true }).click();
    const calendar = page.getByRole('dialog', { name: 'Choose date and time', exact: true });
    await expect(calendar).toBeVisible();
    await calendar.getByRole('textbox', { name: 'Hour', exact: true }).fill('12');
    await calendar.getByRole('textbox', { name: 'Minute', exact: true }).fill('34');
    await calendar.getByRole('button', { name: 'Done', exact: true }).click();
    await page.screenshot({
      path: info.outputPath('assessment-edited.png'),
      animations: 'disabled',
    });
    await details.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(details).toBeHidden();
    await expect(row).toBeFocused();
    const edited = (await readAll<CourseAssessment>(page, 'courseAssessments')).find(
      (entry) => entry.id === original.id,
    )!;
    expect(edited.examDate).not.toBe(original.examDate);
    expect(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: edited.timeZone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(edited.examDate),
    ).toBe('12:34');
    expect(edited).toMatchObject({
      name: original.name,
      coverageMode: original.coverageMode,
      excludedCardIds: original.excludedCardIds,
    });
    await page.reload();
    await row.click();
    await details.getByRole('button', { name: 'Remove exam date', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Remove exam date', exact: true });
    await expect(confirmation).toBeVisible();
    await page.screenshot({
      path: info.outputPath('remove-exam-date.png'),
      animations: 'disabled',
    });
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(details).toBeHidden();
    await page.reload();
    const retained = (await readAll<CourseAssessment>(page, 'courseAssessments')).find(
      (entry) => entry.id === original.id,
    )!;
    expect(retained).toMatchObject({
      name: original.name,
      schedulingMode: 'steady',
      coverageMode: original.coverageMode,
    });
    expect(retained.examDate).toBeUndefined();
    await row.click();
    await expect(details.getByRole('button', { name: 'Remove exam date' })).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('exam-date-removed.png'),
      animations: 'disabled',
    });
    await details.getByRole('button', { name: 'Add exam date', exact: true }).click();
    await details.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(details).toBeHidden();
    await expect
      .poll(
        async () =>
          (await readAll<CourseAssessment>(page, 'courseAssessments')).find(
            (entry) => entry.id === original.id,
          )?.examDate,
      )
      .toBeDefined();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
