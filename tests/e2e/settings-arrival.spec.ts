import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ serviceWorkers: 'block' });

interface ArrivalSample {
  at: number;
  opacities: number[];
  elements: number;
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Settings cascades from heading to groups with ${reducedMotion} motion`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await page.evaluate(() => {
      const state = window as typeof window & { settingsArrival?: ArrivalSample[] };
      state.settingsArrival = [];
      let firstAt: number | undefined;
      function opacity(element: HTMLElement): number {
        let result = 1;
        for (let current: HTMLElement | null = element; current; current = current.parentElement) {
          result *= Number(getComputedStyle(current).opacity);
        }
        return result;
      }
      function sample(at: number) {
        const cards = ['settings-appearance', 'settings-input', 'settings-pomodoro'].map((id) =>
          document.getElementById(id),
        );
        const heading = document.querySelector<HTMLElement>('main h1');
        const groups = [
          ...document.querySelectorAll<HTMLElement>('section[id^="settings-group-"]'),
        ];
        if (cards.every((card) => card !== null) && heading && groups.length === 5) {
          firstAt ??= at;
          state.settingsArrival!.push({
            at: at - firstAt,
            opacities: [heading, ...cards, ...groups].map((element) => opacity(element!)),
            elements: document.querySelectorAll('main *').length,
          });
          if (at - firstAt >= 800) return;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForFunction(() => {
      const state = window as typeof window & { settingsArrival?: ArrivalSample[] };
      return (state.settingsArrival?.at(-1)?.at ?? 0) >= 800;
    });
    const samples = await page.evaluate(() => {
      const state = window as typeof window & { settingsArrival?: ArrivalSample[] };
      return state.settingsArrival!;
    });
    await testInfo.attach('settings-arrival.json', {
      body: JSON.stringify(samples, null, 2),
      contentType: 'application/json',
    });
    await page.screenshot({ path: testInfo.outputPath('settings.png') });

    if (reducedMotion === 'reduce') {
      expect(samples[0].opacities).toEqual(Array(9).fill(1));
    } else {
      const startedAt = samples[0].opacities.map(
        (_, index) => samples.find((sample) => sample.opacities[index] > 0.05)?.at ?? Infinity,
      );
      expect(startedAt[0], 'heading leads the common controls').toBeLessThan(startedAt[1]);
      expect(startedAt[1], 'common controls lead the group rows').toBeLessThan(startedAt[4]);
      expect(startedAt.slice(4), 'group rows trickle down in order').toEqual(
        [...startedAt.slice(4)].sort((a, b) => a - b),
      );
      expect(startedAt[4]).toBeLessThan(startedAt[8]);
      const settled = samples.find((sample) => sample.opacities.every((value) => value >= 0.99));
      expect(settled, 'the whole cascade finishes promptly').toBeDefined();
      expect(settled!.at).toBeLessThan(650);
    }
  });
}
