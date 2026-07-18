import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GradingDemo } from './GradingDemo';
import { PathDemo } from './PathDemo';
import { PracticeDeck } from './PracticeDeck';
import type { ScrollDrivenDemoHandle } from './scrollDrivenDemo';

function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 800,
    width: 800,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

function placeInReadingArea(section: Element) {
  vi.spyOn(section, 'getBoundingClientRect').mockReturnValue(rect(32, 744));
  vi.spyOn(section.firstElementChild!, 'getBoundingClientRect').mockReturnValue(rect(300, 700));
}

function scrollOneAction(ref: React.RefObject<ScrollDrivenDemoHandle | null>) {
  act(() => {
    expect(ref.current?.consumeScroll(120)).toBe(true);
  });
  act(() => {
    expect(ref.current?.consumeScroll(120)).toBe(true);
  });
}

describe('scroll-driven welcome demos', () => {
  it('runs the grading session with the Yes, No, Yes sequence', () => {
    const ref = createRef<ScrollDrivenDemoHandle>();
    const onComplete = vi.fn();
    const { container } = render(
      <section>
        <GradingDemo ref={ref} onComplete={onComplete} />
      </section>,
    );
    placeInReadingArea(container.firstElementChild!);

    for (let card = 0; card < 3; card += 1) {
      scrollOneAction(ref);
      scrollOneAction(ref);
      scrollOneAction(ref);
    }

    expect(screen.getByText('Session complete')).toBeInTheDocument();
    expect(
      screen.getByText('three cards · no four-button guesswork').nextElementSibling,
    ).toHaveTextContent('Exam ΔR +2.2%');
    expect(onComplete).toHaveBeenCalledOnce();
    expect(ref.current?.consumeScroll(240)).toBe(false);
  });

  it('completes each course-path node in order', () => {
    const ref = createRef<ScrollDrivenDemoHandle>();
    const onComplete = vi.fn();
    const { container } = render(
      <section>
        <PathDemo ref={ref} onComplete={onComplete} />
      </section>,
    );
    placeInReadingArea(container.firstElementChild!);

    scrollOneAction(ref);
    scrollOneAction(ref);
    scrollOneAction(ref);

    expect(
      screen.getByText(
        'Path complete — every course ends at a fixed exam date, just like this page.',
      ),
    ).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(ref.current?.consumeScroll(240)).toBe(false);
  });

  it('advances and finishes all five practice cards', () => {
    const ref = createRef<ScrollDrivenDemoHandle>();
    const onComplete = vi.fn();
    const { container } = render(
      <section>
        <PracticeDeck ref={ref} onComplete={onComplete} />
      </section>,
    );
    placeInReadingArea(container.firstElementChild!);

    for (let card = 0; card < 5; card += 1) scrollOneAction(ref);

    expect(screen.getByText('Practice clear')).toBeInTheDocument();
    expect(screen.getByText('Queue empty')).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(ref.current?.consumeScroll(240)).toBe(false);
  });

  it('leaves the wheel alone until the heading is at the top and the whole demo is visible', () => {
    const ref = createRef<ScrollDrivenDemoHandle>();
    const { container } = render(
      <section>
        <GradingDemo ref={ref} />
      </section>,
    );
    const section = container.firstElementChild!;
    const sectionRect = vi
      .spyOn(section, 'getBoundingClientRect')
      .mockReturnValue(rect(240, 952));
    const demoRect = vi
      .spyOn(section.firstElementChild!, 'getBoundingClientRect')
      .mockReturnValue(rect(400, 700));

    expect(ref.current?.consumeScroll(240)).toBe(false);

    sectionRect.mockReturnValue(rect(32, 900));
    demoRect.mockReturnValue(rect(360, 820));
    expect(ref.current?.consumeScroll(240)).toBe(false);

    expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument();
  });
});
