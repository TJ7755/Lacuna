import { render, screen } from '@testing-library/react';
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
    const contentColumn = header?.parentElement?.parentElement;
    const rail = screen.getByRole('button', { name: 'Courses & lessons' }).closest('aside');

    expect(screen.queryByText('Documentation')).not.toBeInTheDocument();
    expect(header).not.toHaveClass('rounded-2xl', 'border', 'bg-surface');
    expect(contentColumn).toHaveClass('min-w-0', 'flex-1');
    expect(contentColumn).not.toHaveClass('max-w-4xl');
    expect(rail).toHaveClass('w-56');
    expect(screen.queryByText('On this page')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Everything you need to know about using Lacuna/),
    ).not.toBeInTheDocument();

    const courseSection = screen.getByRole('heading', { name: 'Courses & lessons' }).closest('section');
    const sectionCard = courseSection?.firstElementChild;
    const courseExplanation = screen.getByRole('heading', { name: 'Courses' }).parentElement;
    expect(sectionCard).toHaveClass('rounded-2xl', 'border', 'bg-surface', 'p-6', 'md:p-8');
    expect(courseExplanation).not.toHaveClass('rounded-xl', 'bg-surface-raised', 'p-5');
  });
});
