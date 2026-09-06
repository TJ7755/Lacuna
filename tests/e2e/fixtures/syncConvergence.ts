import { expect, type Page } from '@playwright/test';

export async function addCard(page: Page, courseId: string, front: string): Promise<void> {
  await page.goto(`/#/course/${courseId}/cards`);
  await page
    .getByRole('group', { name: 'Add content' })
    .getByRole('button', { name: 'New card' })
    .click();
  await page.getByRole('textbox', { name: 'Front' }).fill(front);
  await page.getByRole('textbox', { name: 'Back' }).fill(`${front} answer`);
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/cards$`));
  await expect(page.getByText(front, { exact: true }).last()).toBeVisible();
}

export async function addLessonCard(page: Page, courseId: string, front: string): Promise<void> {
  await page.goto(`/#/course/${courseId}`);
  await page.getByRole('button', { name: 'Author mode' }).click();
  await expect(page.locator('[data-lesson-workspace-mode="edit"]')).toBeVisible();
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page.getByRole('textbox', { name: 'Front' }).fill(front);
  await page.getByRole('textbox', { name: 'Back' }).fill(`${front} answer`);
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/lesson/[^/]+$`));
  await expect(page.getByText(front, { exact: true })).toBeVisible();
}

export async function editOnlyCard(page: Page, courseId: string, front: string): Promise<void> {
  await page.goto(`/#/course/${courseId}/cards`);
  await page.getByTitle('Edit card').click();
  await page.getByRole('textbox', { name: 'Front' }).fill(front);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(front, { exact: true }).last()).toBeVisible();
}

export async function deleteOnlyCard(page: Page, courseId: string): Promise<void> {
  await page.goto(`/#/course/${courseId}/cards`);
  await page.getByTitle('Delete card').click();
  await expect(page.getByText('This course has no cards yet.', { exact: true })).toBeVisible();
}

export async function reviewOnlyCard(page: Page, courseId: string): Promise<string> {
  const cardId = await completeOnlyCard(page, courseId);
  await expect.poll(async () => (await readAll(page, 'reviewHistory')).length > 0).toBe(true);
  return cardId;
}

export async function exposeOnlyCard(page: Page, courseId: string): Promise<string> {
  return completeOnlyCard(page, courseId);
}

export async function suppressStudyEndSync(page: Page): Promise<void> {
  // This scenario drives a deliberate manual write collision; automatic
  // study-end sync has separate trigger coverage and would race that barrier.
  await page.evaluate(() => {
    const dispatch = window.dispatchEvent.bind(window);
    window.dispatchEvent = (event: Event) =>
      event.type === 'lacuna:study-session-end' ? true : dispatch(event);
  });
}

async function completeOnlyCard(page: Page, courseId: string): Promise<string> {
  await page.goto(`/#/course/${courseId}`);
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  const routeChoice = page.getByRole('button', { name: /Start:|Continue:/ }).first();
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  const studyCard = page.locator('[data-study-card-id]');
  await expect(routeChoice.or(continueButton).or(studyCard)).toBeVisible();
  if (await routeChoice.isVisible()) await routeChoice.click();
  if (await continueButton.isVisible()) await continueButton.click();
  await expect(studyCard).toBeVisible();
  const cardId = await studyCard.getAttribute('data-study-card-id');
  if (!cardId) throw new Error('The study card has no persisted identity.');
  await page.keyboard.press('Space');
  await page.keyboard.press('Y');
  await expect(page.getByText('Step complete', { exact: true })).toBeVisible();
  return cardId;
}

export async function syncNow(page: Page): Promise<void> {
  await page.goto('/#/settings');
  const button = page.getByRole('button', { name: 'Sync now', exact: true });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith('/state') && response.request().method() === 'GET',
    ),
    button.click(),
  ]);
  await expect
    .poll(
      async () => {
        if (new URL(page.url()).hash !== '#/settings') return true;
        return button.isEnabled({ timeout: 250 }).catch(() => false);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

export async function readAll<T>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(
    async (tableName) =>
      new Promise<T[]>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(tableName, 'readonly');
          const rows = transaction.objectStore(tableName).getAll();
          rows.onerror = () => reject(rows.error);
          rows.onsuccess = () => resolve(rows.result as T[]);
          transaction.oncomplete = () => database.close();
        };
      }),
    table,
  );
}
