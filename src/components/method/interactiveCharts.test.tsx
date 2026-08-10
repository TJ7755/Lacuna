import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlendCurve } from './BlendCurve';
import { LossExplorer } from './LossExplorer';
import { SigmoidExplorer } from './SigmoidExplorer';

const charts = [
  {
    name: 'Predicted probability of recall',
    render: () => <LossExplorer />,
    nextValue: '0.95',
  },
  {
    name: 'Weighted sum z',
    render: () => <SigmoidExplorer />,
    nextValue: '1.7',
  },
  {
    name: 'Days since last review',
    render: () => <BlendCurve />,
    nextValue: '0.7',
  },
];

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Method interactive charts', () => {
  it.each(charts)('$name changes value with arrow keys', ({ name, render: renderChart, nextValue }) => {
    render(renderChart());
    const slider = screen.getByRole('slider', { name });

    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(slider).toHaveAttribute('aria-valuenow', nextValue);
  });

  it.each(charts)('$name takes focus when pointer dragging starts', ({ name, render: renderChart }) => {
    render(renderChart());
    const slider = screen.getByRole('slider', { name });
    const svg = slider.closest('svg')!;

    Object.defineProperty(slider, 'setPointerCapture', { configurable: true, value: () => {} });
    Object.defineProperty(slider, 'hasPointerCapture', { configurable: true, value: () => true });
    Object.defineProperty(slider, 'releasePointerCapture', { configurable: true, value: () => {} });
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 560, top: 0, right: 560, bottom: 240, height: 240 }),
    });

    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 280 });

    expect(slider).toHaveFocus();
  });
});
