import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it.each(['course', 'lesson', 'recall', 'settings'])(
  '%s capture has enough pixels for the expanded Retina view',
  (name) => {
    const png = readFileSync(`src/pages/quizlet/captures/${name}.png`);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(2880);
    expect(png.readUInt32BE(20)).toBeGreaterThanOrEqual(1920);
    expect(png.readUInt32BE(16) / png.readUInt32BE(20)).toBe(1.5);
  },
);
