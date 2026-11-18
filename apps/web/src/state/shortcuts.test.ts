import { describe, expect, it } from 'vitest';
import { SHORTCUT_GROUPS } from './shortcuts';

describe('SHORTCUT_GROUPS', () => {
  it('distinguishes quick search from the full content-search page', () => {
    const anywhere = SHORTCUT_GROUPS.find((group) => group.title === 'Anywhere');
    expect(anywhere?.shortcuts).toEqual(
      expect.arrayContaining([
        { keys: ['Ctrl/Cmd', 'K'], description: 'Open quick search' },
        { keys: ['/'], description: 'Open Search content' },
      ]),
    );
  });
});
