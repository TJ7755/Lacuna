import { expect, it } from 'vitest';
import { optimiseEnabledForDeck } from './optimiseSetting';

it.each([
  [false, true, false],
  [true, false, true],
  [undefined, true, true],
  [undefined, false, false],
])('resolves deck override %s with global default %s', (override, globalDefault, expected) => {
  expect(optimiseEnabledForDeck(override, globalDefault)).toBe(expected);
});
