import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NAV_ITEMS, type SidebarSettings } from '../../state/sidebarSettings';
import { SidebarSection } from './SidebarSection';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['off'],
  speedMultiplier: () => 0,
}));

const key = 'lacuna.sidebarSettings';
const savedNav = () => (JSON.parse(localStorage.getItem(key)!) as SidebarSettings).navItems;

describe('Sidebar navigation ordering', () => {
  beforeEach(() => localStorage.removeItem(key));

  it('gives each reorder control the shared minimum target size', () => {
    render(<SidebarSection />);
    for (const button of screen.getAllByRole('button', { name: /^Move .+ (up|down)$/ }))
      expect(button).toHaveClass('h-11', 'w-11');
  });

  it('persists ordering and keeps boundary actions disabled', () => {
    render(<SidebarSection />);
    expect(screen.getByRole('button', { name: 'Move Today up' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Today down' }));
    expect(
      savedNav()
        .map((item) => item.id)
        .slice(0, 2),
    ).toEqual(['search', 'dashboard']);
    expect(screen.getByRole('button', { name: 'Move Today up' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(savedNav()).toEqual(DEFAULT_NAV_ITEMS);
  });

  it('reorders only within the rendered groups and keeps Settings available', () => {
    render(<SidebarSection />);
    expect(screen.getByRole('button', { name: 'Move Share up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Progress down' })).toBeDisabled();
    const settings = screen.getByRole('switch', { name: 'Show Settings' });
    expect(settings).toBeDisabled();
    expect(settings).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Move Share down' }));
    const more = screen.getByRole('group', { name: 'More' });
    expect(
      within(more)
        .getAllByRole('switch')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['Show Settings', 'Show Share', 'Show Help']);
    expect(
      savedNav()
        .filter((item) => ['share', 'settings', 'help'].includes(item.id))
        .map((item) => item.id),
    ).toEqual(['settings', 'share', 'help']);
  });
});
