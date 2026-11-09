import { useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalSetting, storedString, oneOf } from './localSetting';
const colour = createLocalSetting({
  key: 'lacuna.testColour',
  event: 'lacuna:test-colour',
  parse: oneOf(['red', 'blue'], 'red'),
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('createLocalSetting', () => {
  it('updates the hook from the custom event and from other tabs', () => {
    const { result } = renderHook(() => colour.use());
    expect(result.current[0]).toBe('red');
    act(() => colour.write('blue'));
    expect(result.current[0]).toBe('blue');
    act(() => {
      localStorage.setItem('lacuna.testColour', 'red');
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(result.current[0]).toBe('red');
    act(() => result.current[1]('blue'));
    expect(result.current[0]).toBe('blue');
    expect(localStorage.getItem('lacuna.testColour')).toBe('blue');
  });

  it('removes both listeners on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => colour.use());
    const added = add.mock.calls.map(([type, listener]) => [type, listener]);
    expect(added.map(([type]) => type)).toEqual(['storage', 'lacuna:test-colour']);
    unmount();
    expect(remove.mock.calls.map(([type, listener]) => [type, listener])).toEqual(added);
  });
});

it('observes preference changes between the initial read and subscribing', () => {
  const { result } = renderHook(() => {
    const value = colour.use();
    useLayoutEffect(() => colour.write('blue'), []);
    return value;
  });
  expect(result.current[0]).toBe('blue');
});

describe('storedString compatibility', () => {
  it.each(['', '0', 'false', 'pending', '{"version":1}', 'malformed'])(
    'retains legacy raw value %j',
    (raw) => {
      localStorage.setItem('lacuna:draft:course:old', raw);
      const entry = storedString('lacuna:draft:course:old');
      expect(entry.read()).toBe(raw);
      expect(entry.isPresent()).toBe(true);
      localStorage.removeItem('lacuna:draft:course:old');
      entry.write(raw);
      expect(localStorage.getItem('lacuna:draft:course:old')).toBe(raw);
      entry.remove();
      expect(entry.read()).toBeNull();
      expect(entry.isPresent()).toBe(false);
    },
  );
  it('propagates unavailable storage to caller recovery', () => {
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => storedString('legacy').remove()).toThrow('blocked');
  });
});
