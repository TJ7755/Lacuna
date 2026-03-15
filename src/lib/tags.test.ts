import { describe, it, expect } from 'vitest';
import { normaliseTagName } from './tags';

describe('normaliseTagName', () => {
  it('trims leading whitespace', () => {
    expect(normaliseTagName('  french')).toBe('french');
  });

  it('trims trailing whitespace', () => {
    expect(normaliseTagName('french  ')).toBe('french');
  });

  it('lowercases all input', () => {
    expect(normaliseTagName('FRENCH')).toBe('french');
  });

  it('trims and lowercases together', () => {
    expect(normaliseTagName('  French  ')).toBe('french');
  });

  it('returns an empty string for an empty string', () => {
    expect(normaliseTagName('')).toBe('');
  });

  it('leaves already-normalised input unchanged', () => {
    expect(normaliseTagName('french')).toBe('french');
  });
});
