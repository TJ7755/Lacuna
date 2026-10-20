import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function luminance(hsl: string) {
  const [h, saturation, lightness] = hsl.match(/[\d.]+/g)!.map(Number);
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

describe('readable secondary text', () => {
  const css = readFileSync('src/index.css', 'utf8');
  it.each([':root', '.dark'])('keeps faint text above 4.5:1 on %s reading surfaces', (theme) => {
    const block = css.slice(css.indexOf(`${theme} {`)).split('}')[0];
    const token = (name: string) => luminance(block.match(new RegExp(`--${name}: ([^;]+);`))![1]);
    const ink = token('ink-faint');
    for (const surface of ['paper', 'surface', 'surface-raised', 'chrome']) {
      const background = token(surface);
      expect(
        (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05),
        surface,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('colour scheme', () => {
  const css = readFileSync('src/index.css', 'utf8');
  // The seed drawings and native controls follow color-scheme, not the theme class.
  it.each([
    [':root', 'light'],
    ['.dark', 'dark'],
  ])('declares %s as %s', (theme, scheme) => {
    const block = css.slice(css.indexOf(`${theme} {`)).split('}')[0];
    expect(block).toContain(`color-scheme: ${scheme};`);
  });
});

describe('course identity palette', () => {
  const css = readFileSync('src/index.css', 'utf8');
  it.each([':root', '.dark'])('keeps course indicators and small glyph text above 4.5:1 in %s', (theme) => {
    const block = css.slice(css.indexOf(`${theme} {`)).split('}')[0];
    const token = (name: string) => luminance(block.match(new RegExp(`--${name}: ([^;]+);`))![1]);
    for (const name of ['accent-ink', 'series-1', 'series-2', 'series-3', 'series-4', 'series-5']) {
      const foreground = token(name);
      for (const surface of ['paper', 'surface', 'surface-raised', 'chrome']) {
        const background = token(surface);
        expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05), `${name} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('flat card surfaces', () => {
  const css = readFileSync('src/index.css', 'utf8');

  it('uses one theme-token hairline and no shadow', () => {
    const utility = css.match(/@utility card-surface \{([^}]+)\}/)?.[1];
    expect(css).toContain('--card-border: 1px solid hsl(var(--line));');
    expect(utility?.trim()).toBe('border: var(--card-border);');
  });

  it.each([':root', '.dark'])('keeps control boundaries above 3:1 on %s surfaces', (theme) => {
    const block = css.slice(css.indexOf(`${theme} {`)).split('}')[0];
    const token = (name: string) => luminance(block.match(new RegExp(`--${name}: ([^;]+);`))![1]);
    const boundary = token('ink-faint');
    for (const surface of ['paper', 'surface', 'surface-raised']) {
      const background = token(surface);
      expect(
        (Math.max(boundary, background) + 0.05) / (Math.min(boundary, background) + 0.05),
        surface,
      ).toBeGreaterThanOrEqual(3);
    }
    expect(css).toMatch(/@utility card-surface-control \{\s*--card-border: 1px solid hsl\(var\(--ink-faint\)\);\s*\}/);
  });
});
