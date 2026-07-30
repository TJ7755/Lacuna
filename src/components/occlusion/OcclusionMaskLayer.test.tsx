import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OcclusionMaskLayer, type OcclusionMaskRegion } from './OcclusionMaskLayer';

const REGIONS: OcclusionMaskRegion[] = [
  { id: 'r1', x: 0.1, y: 0.2, w: 0.3, h: 0.4, visual: 'target' },
  { id: 'r2', x: 0.5, y: 0.5, w: 0.1, h: 0.1, visual: 'masked' },
];

describe('OcclusionMaskLayer', () => {
  it('positions regions in percentages derived from their fractions, never pixels', () => {
    const { container } = render(
      <OcclusionMaskLayer assetUrl="blob:diagram" alt="Diagram" regions={REGIONS} />,
    );
    const overlays = container.querySelectorAll('.absolute');
    expect(overlays[0]).toHaveStyle({ left: '10%', top: '20%', width: '30%', height: '40%' });
    expect(overlays[1]).toHaveStyle({ left: '50%', top: '50%', width: '10%', height: '10%' });
  });

  it('renders the image with the given accessible name', () => {
    render(<OcclusionMaskLayer assetUrl="blob:diagram" alt="Labelled plant cell" regions={[]} />);
    expect(screen.getByRole('img', { name: 'Labelled plant cell' })).toHaveAttribute(
      'src',
      'blob:diagram',
    );
  });

  it('shows a "?" mark on ringed target regions only', () => {
    const { container } = render(
      <OcclusionMaskLayer assetUrl="blob:diagram" alt="Diagram" regions={REGIONS} />,
    );
    const overlays = container.querySelectorAll('.absolute');
    expect(overlays[0].textContent).toBe('?');
    expect(overlays[1].textContent).toBe('');
  });

  it('is presentational (aria-hidden, no tab stop) when no activation callback is given', () => {
    const { container } = render(
      <OcclusionMaskLayer assetUrl="blob:diagram" alt="Diagram" regions={REGIONS} />,
    );
    const overlay = container.querySelector('.absolute')!;
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay).not.toHaveAttribute('tabIndex');
  });

  it('is reachable and operable by keyboard when an activation callback is given', () => {
    const onRegionClick = vi.fn();
    const { container } = render(
      <OcclusionMaskLayer
        assetUrl="blob:diagram"
        alt="Diagram"
        regions={REGIONS}
        onRegionClick={onRegionClick}
      />,
    );
    const overlay = container.querySelector('.absolute') as HTMLElement;
    expect(overlay).toHaveAttribute('role', 'button');
    expect(overlay).toHaveAttribute('tabIndex', '0');

    fireEvent.click(overlay);
    expect(onRegionClick).toHaveBeenCalledWith('r1');

    onRegionClick.mockClear();
    fireEvent.keyDown(overlay, { key: 'Enter' });
    expect(onRegionClick).toHaveBeenCalledWith('r1');

    onRegionClick.mockClear();
    fireEvent.keyDown(overlay, { key: ' ' });
    expect(onRegionClick).toHaveBeenCalledWith('r1');

    onRegionClick.mockClear();
    fireEvent.keyDown(overlay, { key: 'Tab' });
    expect(onRegionClick).not.toHaveBeenCalled();
  });
});
