import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpPage } from './HelpPage';

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 1,
}));

vi.mock('../state/inputMode', () => ({ useIsTouchMode: () => false }));

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
}

function createMediaQueryList(matches: boolean) {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

describe('HelpPage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: MockIntersectionObserver,
    });
    window.matchMedia = vi.fn().mockReturnValue(createMediaQueryList(true));
  });

  it('uses the shared balanced rail layout without a decorative header eyebrow', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );

    const heading = screen.getByRole('heading', { level: 1, name: 'Help' });
    const header = heading.closest('header');
    const contentColumn = screen
      .getByRole('heading', { name: 'Courses & lessons' })
      .closest('section')?.parentElement?.parentElement?.parentElement;
    const rail = screen.getByRole('button', { name: 'Courses & lessons' }).closest('aside');

    expect(screen.queryByText('Documentation')).not.toBeInTheDocument();
    expect(header).not.toHaveClass('rounded-2xl', 'border', 'bg-surface');
    expect(contentColumn).toHaveClass('min-w-0', 'flex-1');
    expect(contentColumn).not.toHaveClass('max-w-4xl');
    expect(rail).toHaveClass('w-[200px]');
    expect(screen.queryByText('On this page')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Everything you need to know about using Lacuna/),
    ).not.toBeInTheDocument();

    const courseSection = screen
      .getByRole('heading', { name: 'Courses & lessons' })
      .closest('section');
    const sectionCard = courseSection?.firstElementChild;
    const courseExplanation = screen.getByRole('heading', { name: 'Courses' }).parentElement;
    expect(sectionCard).toHaveClass('rounded-3xl', 'bg-surface', 'p-6', 'md:p-7');
    expect(sectionCard).not.toHaveClass('border');
    expect(courseExplanation).not.toHaveClass('rounded-xl', 'bg-surface-raised', 'p-5');
  });

  it('offers the same compact section jumper as Settings on smaller screens', () => {
    window.matchMedia = vi.fn().mockReturnValue(createMediaQueryList(false));
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Jump to help topic' }), {
      target: { value: 'card-types' },
    });
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('provides a single keyboard target for each footer destination', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    for (const name of ['Settings', 'Analytics', 'How the scheduler works']) {
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
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/analytics');
    expect(screen.getByRole('link', { name: 'How the scheduler works' })).toHaveAttribute(
      'href',
      '/method',
    );
  });

  it('explains how to share diagrams with their media using a course file', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    const guidance = screen.getByRole('heading', { name: 'Sharing a diagram' }).parentElement;
    expect(guidance).not.toBeNull();
    expect(within(guidance!).getByText(/Share → Other ways → Course file/)).toBeInTheDocument();
    expect(within(guidance!).getByText(/preserves the diagram and its image/)).toBeInTheDocument();
    expect(
      within(guidance!).getByText(/Share codes cannot carry image or audio files/),
    ).toBeInTheDocument();
  });
});
