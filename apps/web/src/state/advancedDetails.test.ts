import { beforeEach, describe, expect, it } from 'vitest';
import { readAdvancedDetails, writeAdvancedDetails } from './advancedDetails';

beforeEach(() => localStorage.clear());

describe('advanced details preference', () => {
  it('keeps advanced details for an existing learner with no preference', () => {
    expect(readAdvancedDetails()).toBe(true);
    expect(localStorage.getItem('lacuna.advancedDetails')).toBeNull();
  });

  it('retains either explicit choice', () => {
    writeAdvancedDetails(false);
    expect(localStorage.getItem('lacuna.advancedDetails')).toBe('false');
    expect(readAdvancedDetails()).toBe(false);
    writeAdvancedDetails(true);
    expect(readAdvancedDetails()).toBe(true);
  });
});
