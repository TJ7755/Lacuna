import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OcclusionRegion } from '../../db/types';
import { OcclusionRegionPane } from './OcclusionRegionPane';

const box = { shape: 'rectangle', x: 0, y: 0, w: 10, h: 10 } as const;

describe('OcclusionRegionPane', () => {
  it('names each region role in words rather than abbreviations', () => {
    const regions: OcclusionRegion[] = [
      { ...box, id: 'a', role: 'label' },
      { ...box, id: 'b', role: 'feature', pairedRegionId: 'a' },
    ];
    render(
      <OcclusionRegionPane
        regions={regions}
        selectedRegionId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        onEmptied={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Label Box 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feature Region 1 → Box 1' })).toBeInTheDocument();
    expect(screen.queryByText('lbl')).toBeNull();
  });
});
