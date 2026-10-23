import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

let script: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('../..', import.meta.url)),
      loader: 'tsx',
      contents: `
        import { createRoot } from 'react-dom/client';
        import { LazyMotion, domAnimation } from 'motion/react';
        import { ToastProvider, useToast } from './src/components/ui/Toast';
        function Controls() {
          const { notify } = useToast();
          return <>
            <button id="action" onClick={() => notify('Action available.', 'neutral', {
              actionLabel: 'Undo', onAction: () => {},
            })}>Show action</button>
            <button id="persistent" onClick={() => notify('Persistent choice.', 'positive', {
              persistent: true, actionLabel: 'Keep', onAction: () => {},
            })}>Show persistent</button>
          </>;
        }
        createRoot(document.getElementById('root')).render(
          <LazyMotion features={domAnimation}><ToastProvider><Controls /></ToastProvider></LazyMotion>
        );
      `,
    },
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
  });
  script = result.outputFiles[0].text;
});

for (const width of [1280, 390]) {
  for (const kind of ['action', 'persistent'] as const) {
    test(`${kind} toast controls stay hittable throughout entrance at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      // Use the generated application CSS, including its real spacing and theme tokens.
      await page.goto('/');
      const styles = await page
        .locator('link[rel="stylesheet"]')
        .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
      expect(styles.length).toBeGreaterThan(0);
      await page.route('**/__toast-controls.js', (route) =>
        route.fulfill({ contentType: 'application/javascript', body: script }),
      );
      await page.route('**/__toast-controls', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html><head>${styles
            .map((href) => `<link rel="stylesheet" href="${href}">`)
            .join(
              '',
            )}</head><body><div id="root"></div><script src="/__toast-controls.js"></script></body></html>`,
        }),
      );
      await page.goto('/__toast-controls');
      await expect(page.locator(`#${kind}`)).toBeVisible();

      const samples = await page.evaluate(
        (kind) =>
          new Promise<
            {
              scale: number;
              toastHeight: number;
              bottomGap: number;
              controls: { label: string; height: number; width: number; hittable: boolean }[];
            }[]
          >((resolve) => {
            const samples: {
              scale: number;
              toastHeight: number;
              bottomGap: number;
              controls: { label: string; height: number; width: number; hittable: boolean }[];
            }[] = [];
            const observer = new MutationObserver(() => {
              const toast = document.querySelector<HTMLElement>('.toast-stack > div');
              if (!toast) return;
              observer.disconnect();
              const start = performance.now();
              function sample() {
                const bounds = toast!.getBoundingClientRect();
                const transform = new DOMMatrixReadOnly(getComputedStyle(toast!).transform);
                samples.push({
                  scale: transform.a,
                  toastHeight: bounds.height,
                  bottomGap: innerHeight - bounds.bottom,
                  controls: Array.from(toast!.querySelectorAll('button'), (button) => {
                    const rect = button.getBoundingClientRect();
                    const x = rect.x + rect.width / 2;
                    const y = rect.y + rect.height / 2;
                    // Check a 44px diameter inside the rounded control, including any overlays.
                    const hittable = [
                      [-22, 0],
                      [22, 0],
                      [0, -22],
                      [0, 22],
                    ].every(([dx, dy]) =>
                      button.contains(document.elementFromPoint(x + dx, y + dy)),
                    );
                    return {
                      label: button.getAttribute('aria-label') ?? button.textContent!,
                      height: rect.height,
                      width: rect.width,
                      hittable,
                    };
                  }),
                });
                if (performance.now() - start < 260) requestAnimationFrame(sample);
                else resolve(samples);
              }
              sample();
            });
            observer.observe(document.body, { childList: true, subtree: true });
            document.getElementById(kind)!.click();
          }),
        kind,
      );
      await testInfo.attach('entrance-geometry', {
        body: JSON.stringify(samples),
        contentType: 'application/json',
      });
      expect(Math.min(...samples.map((sample) => sample.scale))).toBeCloseTo(0.96, 3);
      expect(samples.at(-1)!.scale).toBeCloseTo(1, 3);
      for (const sample of samples) {
        expect(sample.toastHeight).toBeLessThanOrEqual(56);
        expect(sample.bottomGap).toBeLessThanOrEqual(24);
        expect(sample.controls).toHaveLength(kind === 'persistent' ? 2 : 1);
        for (const control of sample.controls) {
          expect(control.height, control.label).toBeGreaterThanOrEqual(44);
          expect(control.width, control.label).toBeGreaterThanOrEqual(44);
          expect(control.hittable, control.label).toBe(true);
        }
      }
      const notifications = page.getByLabel('Notifications', { exact: true });
      await notifications.screenshot({ path: testInfo.outputPath(`${kind}-toast.png`) });
      if (kind === 'persistent') {
        await expect(notifications.locator('.origin-left')).toHaveCount(0);
        await notifications.getByRole('button', { name: 'Dismiss' }).click();
      } else {
        await notifications.getByRole('button', { name: 'Undo' }).click();
      }
      await expect(notifications.getByRole('button')).toHaveCount(0);
    });
  }
}
