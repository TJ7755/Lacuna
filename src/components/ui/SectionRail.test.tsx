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

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
  observe = observe;
  disconnect = disconnect;
  unobserve = vi.fn();
}

beforeEach(() => {
  observerCallback = null;
  observe.mockClear();
  disconnect.mockClear();
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  });
  document.body.innerHTML = '<div id="section-a"></div><div id="section-b"></div>';
});

afterEach(() => {
  document.body.innerHTML = '';
});

function Harness({ onNavigate = vi.fn() }: { onNavigate?: (id: string) => void }) {
  const { activeSection, goToSection } = useSectionRail(SECTIONS);
  return (
    <>
      <SectionRail
        sections={SECTIONS}
        activeSection={activeSection}
        onNavigate={(id) => {
          goToSection(id);
          onNavigate(id);
        }}
        motionMultiplier={0}
      />
      <SectionRailMobileJumper sections={SECTIONS} activeSection={activeSection} onNavigate={onNavigate} />
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

  it('reflects the active section in the mobile jumper select', () => {
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
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const select = screen.getByLabelText('Jump to section') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'section-b' } });
    expect(onNavigate).toHaveBeenCalledWith('section-b');
  });
});
