import { expectAppDestination } from '../../tests/helpers/expectAppDestination';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpPage } from './HelpPage';

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 1,
}));

let touchMode = false;
vi.mock('../state/inputMode', () => ({ useIsTouchMode: () => touchMode }));

describe('HelpPage', () => {
  beforeEach(() => {
    touchMode = false;
    window.history.replaceState(null, '', '/');
  });

  it('opens a recognised topic from the final HashRouter fragment and follows changes', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    window.history.replaceState(null, '', '/#/help#card-types');
    const { unmount } = render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(scroll.mock.instances.at(-1)).toBe(document.getElementById('card-types'));

    window.history.replaceState(null, '', '/#/help#%6f%63clusions');
    fireEvent(window, new Event('hashchange'));
    expect(scroll.mock.instances.at(-1)).toBe(document.getElementById('occlusions'));
    const calls = scroll.mock.calls.length;
    window.history.replaceState(null, '', '/#/help#%invalid');
    fireEvent(window, new Event('hashchange'));
    expect(scroll).toHaveBeenCalledTimes(calls);
    unmount();
    window.history.replaceState(null, '', '/#/help#card-types');
    fireEvent(window, new Event('hashchange'));
    expect(scroll).toHaveBeenCalledTimes(calls);
  });

  it('follows the Settings layout: overview cards, then closed topic rows', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    for (const name of ['Basics', 'Studying', 'Shortcuts']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('combobox', { name: 'Jump to help topic' })).not.toBeInTheDocument();

    const row = screen.getByRole('button', { name: /Courses & lessons/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { level: 3, name: 'Courses' })).toBeInTheDocument();
  });

  it('shows the gestures instead of keys in touch mode', () => {
    touchMode = true;
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    const card = screen.getByRole('heading', { level: 2, name: 'Shortcuts' }).closest('section')!;
    expect(within(card).getByText('Swipe right')).toBeInTheDocument();
    expect(within(card).queryByText('Space')).not.toBeInTheDocument();
  });

  it('provides a single keyboard target for each footer destination', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    for (const name of ['Settings', 'Progress', 'How the scheduler works']) {
      const link = screen.getByRole('link', { name });
      expect(link.querySelector('button')).toBeNull();
      expect(link).toHaveClass('min-h-11');
    }
  });

  it('presents footer destinations directly without a repeated descriptive caption', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    expect(
      screen.queryByText(/Still have questions\? Check the settings pages/),
    ).not.toBeInTheDocument();
    expectAppDestination(screen.getByRole('link', { name: 'Settings' }), '/settings');
    expectAppDestination(screen.getByRole('link', { name: 'Progress' }), '/analytics');
    expectAppDestination(screen.getByRole('link', { name: 'How the scheduler works' }), '/method');
  });

  it('describes study entry with the controls the study sheet shows', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Review today/)).not.toBeInTheDocument();
    expect(screen.queryByText('Study all cards')).not.toBeInTheDocument();
    expect(screen.getAllByText('Start session').length).toBeGreaterThan(0);
  });

  it('lets the shortcuts table scroll within itself from the keyboard', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Shortcuts & gestures/ }));
    const region = screen.getByRole('region', { name: 'Keyboard shortcuts table' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveClass('overflow-x-auto');
  });

  it('explains how to share diagrams with their media using a course file', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cards & content/ }));
    const guidance = screen.getByRole('heading', { name: 'Sharing a diagram' }).parentElement;
    expect(guidance).not.toBeNull();
    expect(within(guidance!).getByText(/Share → Other ways → Course file/)).toBeInTheDocument();
    expect(within(guidance!).getByText(/preserves the diagram and its image/)).toBeInTheDocument();
    expect(
      within(guidance!).getByText(/Share codes cannot carry image or audio files/),
    ).toBeInTheDocument();
  });
});
