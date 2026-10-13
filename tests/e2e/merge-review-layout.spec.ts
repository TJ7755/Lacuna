import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const fontScale of [1, 1.35]) {
  test(`merge decisions stay reachable above course navigation at text scale ${fontScale}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    // The course list is only in the sidebar at desktop width.
    await createCourse(page, 'Merge layout');
    await page.setViewportSize({ width: 390, height: 844 });
    const courseId = /#\/course\/([^/]+)/.exec(page.url())![1];
    await page.evaluate(
      async ({ courseId, fontScale }) => {
        localStorage.setItem('lacuna-font-scale', String(fontScale));
        localStorage.setItem('lacuna-font-scale-user-set', '1');
        window.dispatchEvent(new CustomEvent('lacuna:font-scale', { detail: fontScale }));
        await new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('lacuna');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(['lessons', 'pendingMergeReviews'], 'readwrite');
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
            const lessons = tx.objectStore('lessons').getAll();
            lessons.onsuccess = () => {
              const lesson = lessons.result.find(
                (row: { courseId: string }) => row.courseId === courseId,
              );
              tx.objectStore('pendingMergeReviews').put({
                id: 'merge-layout-review',
                courseId,
                lineageId: 'merge-layout',
                revision: 2,
                createdAt: Date.now(),
                diff: {
                  creates: { lessons: [], notes: [], cards: [] },
                  updates: {
                    lessons: [
                      {
                        id: lesson.id,
                        description:
                          '![Diagram](/icons/icon-192.png)\n\n' +
                          'A long updated description. '.repeat(80),
                      },
                    ],
                    notes: [],
                    cards: [],
                  },
                  removals: { lessonIds: [], noteIds: [], cardIds: [] },
                  conflicts: [],
                },
              });
            };
          };
        });
      },
      { courseId, fontScale },
    );
    await page.goto(`/#/course/${courseId}/updates`);
    // Dexie's live queries do not see raw IndexedDB writes, so load the seeded review afresh.
    await page.reload();
    const acceptAll = page.getByRole('button', { name: 'Accept all', exact: true });
    await acceptAll.scrollIntoViewIfNeeded();
    const nav = page.getByRole('navigation', { name: 'Course sections' });
    const navBox = await nav.boundingBox();
    const actionBox = await acceptAll.boundingBox();
    expect(actionBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(navBox!.y);
    await expect(page.getByRole('button', { name: 'Review later' })).toBeVisible();

    const detail = page.getByRole('button', { name: 'Expand detail' });
    await detail.focus();
    await detail.press('Enter');
    await expect(page.getByRole('button', { name: 'Collapse detail' })).toBeFocused();
    await expect(page.getByText('Description · Added')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Diagram' })).toBeVisible();
    expect(
      await page.locator('main').evaluate((main) => main.scrollWidth <= main.clientWidth),
    ).toBe(true);
    const accept = page.getByRole('button', { name: 'Accept', exact: true });
    await accept.focus();
    await accept.press('Enter');
    await expect(page.getByRole('link', { name: 'Back to course' })).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'Accepted' })).toHaveText(
      'Accepted. All changes reviewed.',
    );
    await expect
      .poll(() =>
        page.evaluate(
          async (courseId) =>
            new Promise<string>((resolve, reject) => {
              const open = indexedDB.open('lacuna');
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const db = open.result;
                const request = db.transaction('lessons').objectStore('lessons').getAll();
                request.onsuccess = () => {
                  db.close();
                  resolve(
                    request.result.find((row: { courseId: string }) => row.courseId === courseId)
                      ?.description ?? '',
                  );
                };
                request.onerror = () => {
                  db.close();
                  reject(request.error);
                };
              };
            }),
          courseId,
        ),
      )
      .toBe('![Diagram](/icons/icon-192.png)\n\n' + 'A long updated description. '.repeat(80));
  });
}
