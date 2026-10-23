import { expect, test, type Locator } from '@playwright/test';
import type { QuestionSet } from '../../src/questions/questionSets';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function alignment(rail: Locator) {
  return rail.locator('label').evaluateAll((labels) =>
    labels.map((label) => {
      const content = label.lastElementChild!;
      const box = content.getBoundingClientRect();
      const hitArea = label.getBoundingClientRect();
      const track = label.parentElement!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(content.firstChild!);
      const text = range.getBoundingClientRect();
      const indicator = content.querySelector<HTMLElement>('.qs-choice-jev');
      const icon = indicator?.querySelector('svg')?.getBoundingClientRect();
      // Flex layout reserves the full indicator slot while its SVG scales about its centre.
      const slot = indicator && {
        left: box.left + indicator.offsetLeft,
        right: box.left + indicator.offsetLeft + indicator.offsetWidth,
      };
      const left = Math.min(text.left, slot?.left ?? text.left);
      const right = Math.max(text.right, slot?.right ?? text.right);
      const paintedLeft = Math.min(text.left, icon?.left ?? text.left);
      const paintedRight = Math.max(text.right, icon?.right ?? text.right);
      return {
        value: label.querySelector('input')!.value,
        height: box.height,
        hitWidth: hitArea.width,
        hitHeight: hitArea.height,
        railOffset: Math.abs((box.top + box.bottom - track.top - track.bottom) / 2),
        verticalOffset: Math.abs((text.top + text.bottom - box.top - box.bottom) / 2),
        horizontalOffset: Math.abs((left + right - box.left - box.right) / 2),
        iconOffset: icon ? Math.abs((icon.top + icon.bottom - box.top - box.bottom) / 2) : 0,
        paintedHorizontalOffset: Math.abs((paintedLeft + paintedRight - box.left - box.right) / 2),
        iconHorizontalOffset:
          icon && slot ? Math.abs((icon.left + icon.right - slot.left - slot.right) / 2) : 0,
        slotWidth: indicator?.offsetWidth,
        slotHeight: indicator?.offsetHeight,
        iconWidth: icon?.width,
        iconOpacity: indicator ? Number(getComputedStyle(indicator).opacity) : undefined,
      };
    }),
  );
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`centres the marking rail through automatic and manual marks (${reducedMotion})`, async ({
    page,
  }, testInfo) => {
    await page.clock.install();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion });
    await page.addInitScript(() => {
      localStorage.setItem('lacuna-theme', 'light');
      localStorage.setItem(
        'lacuna.jevSettings',
        JSON.stringify({ enabled: true, acceptedConsentVersion: 1 }),
      );
      localStorage.setItem('lacuna.aiHostedAccess', 'browser-test-only');
    });
    await page.route('**/api/ai/session', (route) =>
      route.fulfill({
        json: { token: 'browser-test-session', expiresAt: Date.now() + 600_000 },
      }),
    );
    let release!: () => void;
    const response = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/ai/jev', async (route) => {
      await response;
      await route.fulfill({
        json: {
          model: 'jev-1.14.0',
          inputTokens: 20,
          decisions: [{ model: 'jev-1.14.0', value: 1, confidence: 0.98 }],
        },
      });
    });
    await enterFreshLacuna(page);
    await createCourse(page, 'Marking alignment');
    const courseId = new URL(page.url()).hash.split('/')[2];
    const content: QuestionSet = {
      id: 'marking-alignment',
      courseId,
      title: 'Translation',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'q1',
          prompt: 'Translate the phrase.',
          parts: [
            {
              id: 'part-a',
              prompt: 'The cat',
              subparts: [],
              answer: {
                maxMarks: 1,
                response: { kind: 'written' },
                prerequisiteConceptIds: [],
                allocations: [
                  {
                    id: 'a1',
                    criterion: 'An accurate translation.',
                    explanation: 'Award one mark for le chat.',
                    maxMarks: 1,
                    dimension: 'application',
                    targetConceptIds: [],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await page.evaluate(
      (record) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('questionSets', 'readwrite');
            transaction.objectStore('questionSets').add(record);
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
          };
        }),
      {
        ...content,
        contentVersion: 1,
        contentRevisionId: 'alignment-revision',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    );
    await page.goto(`/#/course/${courseId}/question-sets/${content.id}`);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('textbox', { name: 'Your answer', exact: true }).fill('Le chat');
    await page.getByRole('button', { name: 'Submit question', exact: true }).click();
    const rail = page.getByRole('group', { name: 'Marks awarded' });
    const drop = rail.locator('[data-choice-drop]');
    const indicator = rail.locator('.qs-choice-jev');
    const measurements: Record<string, Awaited<ReturnType<typeof alignment>>> = {};
    const capture = async (state: string, transitioning = false) => {
      measurements[state] = await alignment(rail);
      if (!transitioning) await page.screenshot({ path: testInfo.outputPath(`${state}.png`) });
      for (const row of measurements[state]) {
        expect
          .soft(row.hitWidth, `${state}: ${row.value} label hit width`)
          .toBeGreaterThanOrEqual(44);
        expect
          .soft(row.hitHeight, `${state}: ${row.value} label hit height`)
          .toBeGreaterThanOrEqual(44);
        expect
          .soft(row.verticalOffset, `${state}: ${row.value} text centre`)
          .toBeLessThanOrEqual(2);
        expect
          .soft(row.horizontalOffset, `${state}: ${row.value} layout group centre`)
          .toBeLessThanOrEqual(2);
        if (!transitioning)
          expect
            .soft(row.paintedHorizontalOffset, `${state}: ${row.value} painted group centre`)
            .toBeLessThanOrEqual(2);
        expect
          .soft(row.iconHorizontalOffset, `${state}: ${row.value} indicator scale origin`)
          .toBeLessThanOrEqual(2);
        if (row.slotWidth !== undefined) {
          expect.soft(row.slotWidth, `${state}: indicator slot width`).toBe(14);
          expect.soft(row.slotHeight, `${state}: indicator slot height`).toBe(14);
        }
        expect
          .soft(row.iconOffset, `${state}: ${row.value} indicator centre`)
          .toBeLessThanOrEqual(2);
        expect
          .soft(row.height, `${state}: ${row.value} option height`)
          .toBe(measurements[state][0].height);
        expect.soft(row.railOffset, `${state}: ${row.value} rail centre`).toBeLessThanOrEqual(2);
      }
    };
    await expect(rail).toHaveAttribute('aria-busy', 'true');
    await expect(drop).toHaveAttribute('data-choice-drop', 'pending');
    await capture('pending');
    const pulse = await drop.locator('span').getAttribute('style');
    await page.waitForTimeout(150);
    if (reducedMotion === 'no-preference')
      expect(await drop.locator('span').getAttribute('style')).not.toBe(pulse);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    release();
    await expect
      .poll(
        async () => {
          await page.clock.runFor(16);
          return indicator.count();
        },
        { intervals: [0] },
      )
      .toBe(1);
    await expect(rail.getByRole('radio', { name: /1 \/ 1.*marked automatically/ })).toBeChecked();
    await expect(drop).toHaveAttribute('data-choice-drop', 'accent');
    await capture('verdict', true);
    await page.screenshot({ path: testInfo.outputPath('verdict.png') });
    const automaticRow = (state: string) => measurements[state].find((row) => row.value === '1')!;
    expect
      .soft(automaticRow('verdict').iconWidth)
      .toBeCloseTo(reducedMotion === 'reduce' ? 14 : 14 * 0.4, 2);
    // At scale .4 the painted envelope shifts by 14 * (1 - .4) / 4 = 2.1px.
    // Check the reserved layout and scale origin every frame, then painted centring at rest.
    for (let elapsed = 16; elapsed <= 640; elapsed += 16) {
      await page.clock.runFor(16);
      const state = `verdict-${elapsed}ms`;
      await capture(state, true);
      expect
        .soft(
          measurements[state].map((row) => row.hitWidth),
          `${state}: stable hit widths`,
        )
        .toEqual(measurements.verdict.map((row) => row.hitWidth));
      if (elapsed === 336) await page.screenshot({ path: testInfo.outputPath('revealing.png') });
    }
    if (reducedMotion === 'no-preference') {
      expect
        .soft(
          Object.values(measurements).some((rows) => {
            const width = rows.find((row) => row.value === '1')?.iconWidth;
            return width !== undefined && width > 14 * 0.4 + 0.1 && width < 13.9;
          }),
          'sample the indicator during its reveal',
        )
        .toBe(true);
    }
    await expect(indicator).toHaveCSS('opacity', '1');
    await expect(indicator).toHaveCSS('transform', 'none');
    await expect
      .poll(async () => (await alignment(rail)).find((row) => row.value === '1')?.iconWidth)
      .toBe(14);
    await capture('settled');
    await rail.getByRole('radio', { name: '0 / 1', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(rail.getByRole('radio', { name: '0 / 1', exact: true })).toBeChecked();
    await expect(indicator).toHaveCount(0);
    await capture('manual-zero');
    await rail.getByRole('radio', { name: 'Unsure', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(rail.getByRole('radio', { name: 'Unsure', exact: true })).toBeChecked();
    await expect(drop).toHaveAttribute('data-choice-drop', 'neutral');
    await capture('manual-unsure');
    await rail.getByRole('radio', { name: '1 / 1', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(rail.getByRole('radio', { name: '1 / 1', exact: true })).toBeChecked();
    await expect(indicator).toHaveCount(0);
    await capture('manual-one');
    await testInfo.attach('alignment-measurements', {
      body: JSON.stringify(measurements, null, 2),
      contentType: 'application/json',
    });
  });
}
