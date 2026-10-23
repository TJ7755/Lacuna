import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import sharp from 'sharp';

let fixtureSource: string;
test.beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import { createRoot } from 'react-dom/client';
        import { ForecastChart } from './src/components/dashboard/ForecastChart';
        const now = Date.UTC(2026, 9, 8);
        const day = 86400000;
        createRoot(document.getElementById('fixture')).render(
          <ForecastChart now={now} past={18} future={12} multiplier={0}
            lines={[0, 0, 0.62, 1].map((recall, i) => ({
              id: String(i), name: ['Biology', 'Chemistry', 'Physics', 'History'][i],
              status: 'behind',
              forecast: { end: now + 7 * day, hasExam: true, target: 0.9, ifStopped: recall },
              history: [now - 18 * day, now].map(at => ({ at, recall })),
            }))} />
        );
      `,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'course-colours',
      setup(builder) {
        builder.onResolve({ filter: /state\/ShellCourseData$/ }, () => ({
          path: 'course-colours', namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `export const useCourseColours = () => new Map([
            ['0', 'hsl(var(--accent-ink))'], ['1', 'hsl(var(--series-1))'],
            ['2', 'hsl(var(--series-2))'], ['3', 'hsl(var(--series-3))'],
          ]);`,
        }));
      },
    }],
  });
  fixtureSource = bundle.outputFiles[0].text;
});

for (const size of [100, 200]) {
  test(`forecast percentage glyphs stay intact with a halo at ${size}% text`, async ({ page }) => {
    const index = await (await page.request.get('/')).text();
    const styles = index.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g);
    expect(styles?.length).toBeGreaterThan(0);
    await page.route('**/__forecast_fixture', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html data-accent="blue"><head>${styles!.join('')}</head>
        <body style="padding:24px;background:hsl(var(--surface))">
          <main id="fixture" style="width:800px"></main>
          <div id="samples" style="display:flex;gap:24px;margin-top:32px"></div>
        </body></html>`,
    }));
    await page.goto('/__forecast_fixture');
    await page.addScriptTag({ content: fixtureSource });
    const chart = page.getByRole('img', { name: 'Exam-day forecast' });
    await expect(chart).toBeVisible();
    await page.evaluate(async (percentage) => {
      document.documentElement.style.fontSize = `${percentage}%`;
      await document.fonts.ready;
    }, size);
    const labels = chart.locator('[data-course-id] text:not([aria-hidden])').filter({ hasText: /%$/ });
    await expect(labels).toHaveCount(4);
    await page.screenshot({ path: test.info().outputPath('chart.png'), fullPage: true });

    // Isolate each actual label at the same pixel origin, keeping all its paint layers.
    // This tests glyph damage independently of chart lines and adjacent course labels.
    const colours = await labels.evaluateAll((elements) => elements.map((label, index) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '160');
      svg.setAttribute('height', '80');
      svg.setAttribute('data-sample', String(index));
      const group = label.closest('[data-course-id]')!.cloneNode(true) as SVGGElement;
      group.querySelectorAll('path,circle').forEach((element) => element.remove());
      group.querySelectorAll('[id]').forEach((element) => {
        const previous = element.id;
        element.id = `sample-${index}-${previous}`;
        group.querySelectorAll('use').forEach((use) => {
          if (use.getAttribute('href') === `#${previous}`) {
            use.setAttribute('href', `#${element.id}`);
          }
        });
      });
      group.querySelectorAll('text').forEach((text) => {
        text.setAttribute('x', '12');
        text.setAttribute('y', '40');
      });
      svg.append(group);
      document.getElementById('samples')!.append(svg);
      const style = getComputedStyle(label);
      return { text: label.textContent, fill: style.fill, font: style.fontFamily,
        size: style.fontSize, weight: style.fontWeight, figures: style.fontVariantNumeric };
    }));
    expect(colours.map((label) => label.text).sort()).toEqual(['0%', '0%', '100%', '62%']);
    for (const label of colours) {
      expect(label.font).toContain('Space Grotesk');
      expect(label.size).toBe(`${20 * size / 100}px`);
      expect(label.weight).toBe('600');
      expect(label.figures).toBe('tabular-nums');
    }

    for (let index = 0; index < colours.length; index++) {
      const sample = page.locator(`[data-sample="${index}"]`);
      const painted = await sample.screenshot({ path: test.info().outputPath(`${index}-halo.png`) });
      await sample.locator('text').evaluateAll((texts) => texts.forEach((text) => {
        (text as SVGTextElement).style.stroke = 'none';
      }));
      const plain = await sample.screenshot({ path: test.info().outputPath(`${index}-plain.png`) });
      const actual = await sharp(painted).ensureAlpha().raw().toBuffer();
      const reference = await sharp(plain).ensureAlpha().raw().toBuffer();
      const rgb = colours[index].fill.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      let solid = 0;
      let damaged = 0;
      for (let pixel = 0; pixel < reference.length; pixel += 4) {
        if (!rgb.every((channel, offset) => Math.abs(reference[pixel + offset] - channel) < 3)) continue;
        solid++;
        if (rgb.some((channel, offset) => Math.abs(actual[pixel + offset] - channel) > 12)) damaged++;
      }
      expect(solid).toBeGreaterThan(30);
      expect.soft(damaged, `${colours[index].text}: halo erased solid glyph pixels`).toBe(0);

      // A contrasting line must still be masked outside the glyph by the halo.
      await sample.evaluate((svg) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('d', 'M0 40 H160');
        line.setAttribute('stroke', 'black');
        line.setAttribute('stroke-width', '2');
        svg.prepend(line);
      });
      const unmasked = await sample.screenshot();
      await sample.locator('text').evaluateAll((texts) => texts.forEach((text) => {
        (text as SVGTextElement).style.removeProperty('stroke');
      }));
      const masked = await sample.screenshot({ path: test.info().outputPath(`${index}-line-halo.png`) });
      const countBlack = async (png: Buffer) => {
        const pixels = await sharp(png).ensureAlpha().raw().toBuffer();
        let count = 0;
        for (let pixel = 0; pixel < pixels.length; pixel += 4) {
          if (pixels[pixel] < 10 && pixels[pixel + 1] < 10 && pixels[pixel + 2] < 10) count++;
        }
        return count;
      };
      expect(await countBlack(masked), 'halo must mask a chart line outside the glyph')
        .toBeLessThan(await countBlack(unmasked));
    }
  });
}
