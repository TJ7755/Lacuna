import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useSidebarSettings } from './sidebarSettings';

const key = 'lacuna.sidebarSettings';
beforeEach(() => localStorage.clear());

it.each([null, 'not-json'])('uses the sidebar defaults for %j', (stored) => {
  if (stored !== null) localStorage.setItem(key, stored);
  const { result } = renderHook(useSidebarSettings);
  expect(result.current[0]).toMatchObject({ compactMode: false, showDueCounts: true });
  expect(result.current[0].navItems.map((item) => item.id)).toEqual([
    'dashboard',
    'search',
    'share',
    'analytics',
    'settings',
    'help',
  ]);
});

it('keeps saved sidebar choices and restores access to Settings', () => {
  localStorage.setItem(
    key,
    JSON.stringify({
      showArchived: false,
      showDueCounts: false,
      navItems: [
        { id: 'settings', label: 'Settings', visible: false },
        { id: 'learn', label: 'Study today', visible: true },
        { id: 'archived', label: 'Archived', visible: false },
        { id: 'dashboard', label: 'Dashboard', visible: true },
      ],
    }),
  );
  const { result } = renderHook(useSidebarSettings);
  expect(result.current[0]).not.toHaveProperty('showArchived');
  expect(result.current[0].navItems.map((item) => item.id)).toEqual([
    'settings',
    'dashboard',
    'search',
    'share',
    'analytics',
    'help',
  ]);
  expect(result.current[0].navItems.slice(0, 3)).toEqual([
    { id: 'settings', label: 'Settings', visible: true },
    { id: 'dashboard', label: 'Today', visible: true },
    { id: 'search', label: 'Search', visible: true },
  ]);
  act(() => result.current[1]({ compactMode: true }));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
    showDueCounts: false,
    compactMode: true,
  });
});
