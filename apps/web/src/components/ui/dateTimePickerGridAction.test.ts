import { describe, expect, it } from 'vitest';
import { dateTimePickerGridAction } from './dateTimePickerGridAction';

describe('month and year grid keyboard actions', () => {
  it.each([9, 12])('keeps navigation within a %i-cell grid', (count) => {
    expect(dateTimePickerGridAction(0, count, 'ArrowLeft')).toEqual({ kind: 'move', index: 0 });
    expect(dateTimePickerGridAction(0, count, 'ArrowUp')).toEqual({ kind: 'move', index: 0 });
    expect(dateTimePickerGridAction(count - 1, count, 'ArrowDown')).toEqual({
      kind: 'move',
      index: count - 1,
    });
    expect(dateTimePickerGridAction(count - 1, count, 'ArrowRight')).toEqual({
      kind: 'move',
      index: count - 1,
    });
  });
  it.each([
    ['ArrowLeft', 3],
    ['ArrowRight', 5],
    ['ArrowUp', 1],
    ['ArrowDown', 7],
  ] as const)('moves by the grid geometry for %s', (key, index) => {
    expect(dateTimePickerGridAction(4, 12, key)).toEqual({ kind: 'move', index });
  });
  it.each(['Enter', ' '])('selects the focused cell with %s', (key) => {
    expect(dateTimePickerGridAction(4, 9, key)).toEqual({ kind: 'select', index: 4 });
  });
  it('leaves unrelated keys to the browser', () => {
    expect(dateTimePickerGridAction(4, 9, 'Tab')).toBeNull();
  });
});
