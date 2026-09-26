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
    for (const surface of ['paper', 'surface', 'surface-raised']) {
      const background = token(surface);
      expect(
        (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05),
        surface,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
