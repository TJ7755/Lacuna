import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OcclusionCanvas } from './OcclusionCanvas';

function open() {
  const onRegionDrawn = vi.fn();
  render(
    <OcclusionCanvas
      assetUrl="blob:diagram"
      alt="Plant cell"
      regions={[]}
      selectedRegionId={null}
      tool="label"
      onToolChange={vi.fn()}
      onRegionDrawn={onRegionDrawn}
      onSelectRegion={vi.fn()}
      onFileSelected={vi.fn()}
      uploading={false}
      confirmingReplace={false}
      onConfirmReplace={vi.fn()}
      onCancelReplace={vi.fn()}
    />,
  );
  return { canvas: screen.getByRole('group', { name: 'Draw a region' }), onRegionDrawn };
}

describe('keyboard region drawing', () => {
  it('moves and resizes a selected existing region', () => {
    const onRegionChanged = vi.fn();
    render(<OcclusionCanvas assetUrl="blob:diagram" alt="Plant cell" regions={[{ id: 'region', x: 0.4, y: 0.4, w: 0.2, h: 0.2, role: 'label', shape: 'rectangle' }]} selectedRegionId="region" tool="select" onToolChange={vi.fn()} onRegionDrawn={vi.fn()} onRegionChanged={onRegionChanged} onSelectRegion={vi.fn()} onFileSelected={vi.fn()} uploading={false} confirmingReplace={false} onConfirmReplace={vi.fn()} onCancelReplace={vi.fn()} />);
    const canvas = screen.getByRole('group', { name: 'Position selected region' });
    fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
    expect(onRegionChanged).toHaveBeenLastCalledWith('region', { x: 0.39, y: 0.4, w: 0.2, h: 0.2 });
    fireEvent.keyDown(canvas, { key: 'ArrowUp', shiftKey: true });
    expect(onRegionChanged).toHaveBeenLastCalledWith('region', { x: 0.4, y: 0.4, w: 0.2, h: 0.19 });
  });
  it('draws, positions and resizes a region without a pointer', () => {
    const { canvas, onRegionDrawn } = open();
    canvas.focus();
    fireEvent.keyDown(canvas, { key: 'Enter' });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    fireEvent.keyDown(canvas, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(onRegionDrawn).toHaveBeenCalledOnce();
    expect(onRegionDrawn.mock.calls[0][0]).toEqual({ x: 0.41, y: 0.4, w: 0.2, h: 0.21 });
    expect(canvas).toHaveFocus();
  });

  it('cancels a draft locally with Escape', () => {
    const { canvas, onRegionDrawn } = open();
    fireEvent.keyDown(canvas, { key: 'Enter' });
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    fireEvent(canvas, escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(onRegionDrawn).not.toHaveBeenCalled();
  });

  it('keeps the draft inside the diagram', () => {
    const { canvas, onRegionDrawn } = open();
    fireEvent.keyDown(canvas, { key: 'Enter' });
    for (let i = 0; i < 120; i++) fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    const rect = onRegionDrawn.mock.calls[0][0];
    expect(rect.x + rect.w).toBeLessThanOrEqual(1);
  });
});
