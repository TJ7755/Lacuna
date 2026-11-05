import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type deepmerge from 'deepmerge';

const require = createRequire(import.meta.url);
type Merge = typeof deepmerge;
const commonjs: Merge = require('deepmerge');

// GHSA-gcqx-w48m-w2h4: exercise the installed entry points so a missing Bun
// patch fails CI, including after a frozen install on another platform.
describe.each([
  ['CommonJS', commonjs],
  ['UMD', require('deepmerge/dist/umd.js') as Merge],
] as const)('deepmerge %s security patch', (_name, merge) => {
  const poison = () => JSON.parse('{"__proto__":{"isAdmin":true}}');

  it.each([
    ['null prototype', () => Object.create(null)],
    ['own __proto__', poison],
  ] as const)('does not poison the result with a %s target', (_label, target) => {
    const result = merge(target(), poison());
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.isAdmin).toBeUndefined();
    expect({}).not.toHaveProperty('isAdmin');
  });

  it.each([null, undefined, 0, false, ''])(
    'does not poison nested placeholder %s',
    (placeholder) => {
      const result = merge({ session: placeholder }, { session: poison() });
      expect(Object.getPrototypeOf(result.session)).toBe(Object.prototype);
      expect(result.session).not.toHaveProperty('isAdmin');
    },
  );

  it('retains normal merging, arrays, symbols and custom merge options', () => {
    const symbol = Symbol('option');
    const result = merge(
      { nested: { first: true }, list: [1], [symbol]: { a: 1 } },
      { nested: { second: true }, list: [2], [symbol]: { b: 2 } },
    );
    expect(result).toEqual({
      nested: { first: true, second: true },
      list: [1, 2],
      [symbol]: { a: 1, b: 2 },
    });
    expect(
      merge({ list: [1] }, { list: [2] }, { arrayMerge: (_target, source) => source }),
    ).toEqual({ list: [2] });
  });
});
