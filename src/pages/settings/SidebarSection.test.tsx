import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS, readStored, writeSidebarSettings } from '../../state/sidebarSettings';
import { SidebarSection } from './SidebarSection';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['off'],
  speedMultiplier: () => 0,
}));

describe('Sidebar navigation ordering', () => {
  beforeEach(() => writeSidebarSettings(DEFAULTS));

  it('gives each reorder control the shared minimum target size', () => {
    render(<SidebarSection />);
    for (const button of screen.getAllByRole('button', { name: /^Move .+ (up|down)$/ }))
      expect(button).toHaveClass('h-11', 'w-11');
  });

  it('persists ordering and keeps boundary actions disabled', () => {
    render(<SidebarSection />);
    expect(screen.getByRole('button', { name: 'Move Today up' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Today down' }));
    expect(readStored().navItems.map((item) => item.id).slice(0, 2)).toEqual(['search', 'dashboard']);
    expect(screen.getByRole('button', { name: 'Move Today up' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(readStored().navItems).toEqual(DEFAULTS.navItems);
  });
});
