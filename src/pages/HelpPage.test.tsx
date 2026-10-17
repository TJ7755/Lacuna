import { expectAppDestination } from '../../tests/helpers/expectAppDestination';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpPage } from './HelpPage';

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
}));

describe('HelpPage', () => {
  beforeEach(() => {
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
    expect(screen.getByRole('button', { name: 'Which card type should I use?' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(scroll.mock.instances.at(-1)).toBe(document.getElementById('card-types'));

    window.history.replaceState(null, '', '/#/help#%6f%63clusions');
    fireEvent(window, new Event('hashchange'));
    expect(scroll.mock.instances.at(-1)).toBe(document.getElementById('occlusions'));
    expect(screen.getByRole('button', { name: 'How do I make diagram cards?' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    window.history.replaceState(null, '', '/#/help#tips');
    fireEvent(window, new Event('hashchange'));
    expect(scroll.mock.instances.at(-1)).toBe(document.getElementById('exam-date'));
    expect(screen.getByRole('button', { name: 'How do I set an exam date?' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const calls = scroll.mock.calls.length;
    window.history.replaceState(null, '', '/#/help#%invalid');
    fireEvent(window, new Event('hashchange'));
    expect(scroll).toHaveBeenCalledTimes(calls);
    unmount();
    window.history.replaceState(null, '', '/#/help#card-types');
    fireEvent(window, new Event('hashchange'));
    expect(scroll).toHaveBeenCalledTimes(calls);
  });

  it('groups questions and expands a topic row', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Getting started' })).toBeInTheDocument();
    const row = screen.getByRole('button', { name: 'How do I create a course and lessons?' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Choose New course on Today/)).toBeVisible();
  });

  it('searches all words across questions, answers and keywords, ignoring case', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    const search = screen.getByRole('searchbox', { name: 'Search help' });
    fireEvent.change(search, { target: { value: 'PICTURE sharing' } });
    expect(
      screen.getByRole('button', { name: 'How do I share a diagram with its image?' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.queryByRole('button', { name: 'How do I start studying?' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Share → Other ways → Course file/)).toBeVisible();
    fireEvent.change(search, { target: { value: 'picture nonexistent' } });
    expect(screen.getByText('No matching topics.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByRole('heading', { level: 2, name: 'Getting started' })).toBeInTheDocument();
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

  it('shows customised shortcuts from the shared sheet source in a keyboard-scrollable region', () => {
    localStorage.setItem('lacuna-shortcut-bindings', JSON.stringify({ reveal: 'j' }));
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'How do I see or customise keyboard shortcuts?' }),
    );
    const region = screen.getByRole('region', { name: 'Keyboard shortcuts table' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveClass('overflow-x-auto');
    expect(within(region).getByText('j')).toBeInTheDocument();
    expect(within(region).getByText('Open quick search')).toBeInTheDocument();
    localStorage.removeItem('lacuna-shortcut-bindings');
  });
});
