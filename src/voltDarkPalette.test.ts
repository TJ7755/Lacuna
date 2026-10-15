import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function parseHsl(value: string): { hue: number; saturation: number; lightness: number } {
  const [hue, saturation, lightness] = value.match(/[\d.]+/g)!.map(Number);
  return { hue, saturation, lightness };
}

function darkBlock(): string {
  const css = readFileSync('src/index.css', 'utf8');
  return css.slice(css.indexOf('.dark {')).split('}')[0];
}

function lightBlock(): string {
  const css = readFileSync('src/index.css', 'utf8');
  return css.slice(css.indexOf(':root {')).split('}')[0];
}

function token(block: string, name: string): { hue: number; saturation: number; lightness: number } {
  const match = block.match(new RegExp(`--${name}: ([^;]+);`));
  if (!match) throw new Error(`missing --${name}`);
  return parseHsl(match[1]);
}

describe('Volt dark palette restraint', () => {
  it('keeps the dark ground near black with only a faint green tint', () => {
    const block = darkBlock();
    for (const surface of ['paper', 'surface', 'surface-raised', 'chrome']) {
      expect(token(block, surface).saturation, surface).toBeLessThanOrEqual(10);
    }
    expect(token(block, 'paper').lightness).toBeLessThanOrEqual(5);
    expect(token(block, 'chrome').lightness).toBeLessThanOrEqual(5);
  });

  it('lifts foreground cards clear of the near-black ground', () => {
    const block = darkBlock();
    const paper = token(block, 'paper').lightness;
    const surface = token(block, 'surface').lightness;
    const raised = token(block, 'surface-raised').lightness;
    expect(surface).toBeGreaterThanOrEqual(9);
    expect(surface).toBeLessThanOrEqual(11);
    expect(raised).toBeGreaterThanOrEqual(12);
    expect(raised).toBeLessThanOrEqual(15);
    expect(surface - paper).toBeGreaterThanOrEqual(5);
    expect(raised - paper).toBeGreaterThanOrEqual(8);
  });

  it('tones the lime accent and neutralises dark ink', () => {
    const block = darkBlock();
    expect(token(block, 'accent').saturation).toBeLessThanOrEqual(90);
    expect(token(block, 'accent').lightness).toBeLessThanOrEqual(60);
    expect(token(block, 'accent-ink').saturation).toBeLessThanOrEqual(90);
    expect(token(block, 'ink').saturation).toBeLessThanOrEqual(15);
    expect(token(block, 'ink-faint').saturation).toBeLessThanOrEqual(10);
  });

  it('leaves the light palette untouched', () => {
    const block = lightBlock();
    expect(block).toContain('--paper: 82 30% 94%;');
    expect(block).toContain('--accent: 73 100% 59%;');
  });
});
