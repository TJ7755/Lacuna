import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SectionRail, SectionRailMobileJumper, useSectionRail, type SectionRailItem } from './SectionRail';

const SECTIONS: SectionRailItem[] = [
  { id: 'section-a', label: 'Section A' },
  { id: 'section-b', label: 'Section B' },
];

let observerCallback: IntersectionObserverCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();
const scrollIntoView = vi.fn();

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
  observe = observe;
  disconnect = disconnect;
  unobserve = vi.fn();
}

function createMediaQueryList(matches: boolean) {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

/** Mocks window.matchMedia so useMediaQuery('(min-width: 1280px)') resolves to `isDesktop`. */
function mockViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => createMediaQueryList(isDesktop));
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  observerCallback = null;
  observe.mockClear();
  disconnect.mockClear();
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  scrollIntoView.mockClear();
  document.body.innerHTML = '<div id="section-a"></div><div id="section-b"></div>';
  mockViewport(true);
});

afterEach(() => {
  document.body.innerHTML = '';
  window.matchMedia = originalMatchMedia;
});

function Harness({
  onNavigate = vi.fn(),
  motionMultiplier = 1,
}: {
  onNavigate?: (id: string) => void;
  motionMultiplier?: number;
}) {
  const { activeSection, goToSection } = useSectionRail(SECTIONS, motionMultiplier);
  const navigate = (id: string) => {
    goToSection(id);
    onNavigate(id);
  };
  return (
    <>
      <SectionRail
        sections={SECTIONS}
        activeSection={activeSection}
        onNavigate={navigate}
        motionMultiplier={motionMultiplier}
      />
      <SectionRailMobileJumper
        sections={SECTIONS}
        activeSection={activeSection}
        onNavigate={navigate}
      />
    </>
  );
}

describe('SectionRail', () => {
  it('observes every section on mount', () => {
    render(<Harness />);
    expect(observe).toHaveBeenCalledTimes(SECTIONS.length);
  });

  it('marks the intersecting section as active in the desktop rail', () => {
    render(<Harness />);
    act(() => {
      observerCallback?.(
        [{ isIntersecting: true, target: document.getElementById('section-b') } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    const activeButton = screen.getByRole('button', { name: 'Section B' });
    expect(activeButton).toHaveClass('text-accent');
  });

  it('calls onNavigate when a desktop rail item is clicked', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Section B' }));
    expect(onNavigate).toHaveBeenCalledWith('section-b');
  });

  it.each([
    {
      label: 'uses immediate scrolling when motion is reduced',
      motionMultiplier: 0,
      behavior: 'instant',
    },
    {
      label: 'uses smooth scrolling when motion is enabled',
      motionMultiplier: 1,
      behavior: 'smooth',
    },
  ])('$label', ({ motionMultiplier, behavior }) => {
    render(<Harness motionMultiplier={motionMultiplier} />);

    fireEvent.click(screen.getByRole('button', { name: 'Section B' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior, block: 'start' });
    expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('section-b'));
  });

  it('reflects the active section in the mobile jumper select', () => {
    mockViewport(false);
    render(<Harness />);
    act(() => {
      observerCallback?.(
        [{ isIntersecting: true, target: document.getElementById('section-b') } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    const select = screen.getByLabelText('Jump to section') as HTMLSelectElement;
    expect(select.value).toBe('section-b');
  });

  it('calls onNavigate when the mobile jumper selection changes', () => {
    mockViewport(false);
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const select = screen.getByLabelText('Jump to section') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'section-b' } });
    expect(onNavigate).toHaveBeenCalledWith('section-b');
  });

  it('renders only the desktop rail at desktop widths', () => {
    mockViewport(true);
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Section B' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Jump to section')).not.toBeInTheDocument();
  });

  it('renders only the mobile jumper below the desktop breakpoint', () => {
    mockViewport(false);
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Section B' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Jump to section')).toBeInTheDocument();
  });
});
