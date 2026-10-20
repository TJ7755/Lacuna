import { describe, expect, it, vi } from 'vitest';
import { courseColour } from './colour';

describe('courseColour', () => {
  it('keeps identity stable across reordered, filtered and newly loaded consumers', async () => {
    const ids = ['biology', 'history', 'physics'];
    const initial = new Map(ids.map((id) => [id, courseColour(id)]));
    for (const id of [...ids].reverse().slice(1)) {
      expect(courseColour(id)).toBe(initial.get(id));
    }
    courseColour('unrelated-new-course');
    vi.resetModules();
    const reloaded = await import('./colour');
    for (const id of ids) expect(reloaded.courseColour(id)).toBe(initial.get(id));
    expect(initial.get('biology')).not.toBe(initial.get('history'));
  });

  it('uses theme tokens for every palette slot, including long and non-ASCII IDs', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', '生物学', 'c'.repeat(200)];
    const tokens = ['accent-ink', 'series-1', 'series-2', 'series-3', 'series-4', 'series-5'];
    for (const id of ids)
      expect(tokens.map((token) => `hsl(var(--${token}))`)).toContain(courseColour(id));
    expect(new Set(ids.slice(0, 6).map(courseColour)).size).toBe(6);
  });
});
