import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OcclusionStudyFace } from './OcclusionStudyFace';
import type { Card, Occlusion, OcclusionRegion } from '../../db/types';

const resolveAssetUrl = vi.fn();
vi.mock('../../db/assetCache', () => ({
  resolveAssetUrl: (...args: unknown[]) => resolveAssetUrl(...args),
}));

function region(id: string, role: OcclusionRegion['role'], overrides: Partial<OcclusionRegion> = {}): OcclusionRegion {
  return { id, role, shape: 'rectangle', x: 0.1, y: 0.1, w: 0.1, h: 0.1, ...overrides };
}

function makeOcclusion(overrides: Partial<Occlusion> = {}): Occlusion {
  return {
    id: 'occ-1',
    courseId: 'course-1',
    primaryLessonId: 'lesson-1',
    name: 'Plant cell',
    assetHash: 'a'.repeat(64),
    regions: [
      region('l1', 'label', { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }),
      region('l2', 'label', { x: 0.3, y: 0.1, w: 0.1, h: 0.1 }),
      region('f1', 'feature', { x: 0.5, y: 0.5, w: 0.1, h: 0.1, pairedRegionId: 'l1' }),
    ],
    createdAt: 0,
    ...overrides,
  };
}

function makeCard(occlusionRegionId: string, overrides: Partial<Card> = {}): Card & { occlusionRegionId: string } {
  return {
    id: 'card-1',
    deckId: 'deck-1',
    schedulingUnitId: 'deck-1',
    courseId: 'course-1',
    primaryLessonId: null,
    type: 'front_back',
    front: 'Label 1 of 3 — Plant cell',
    back: 'Label 1 of 3 — Plant cell\n\nRevealed on the diagram.',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    tags: [],
    suspended: false,
    buriedUntil: null,
    occlusionRegionId,
    ...overrides,
  };
}

afterEach(() => {
  resolveAssetUrl.mockReset();
});

describe('OcclusionStudyFace', () => {
  it('masks every label region on the front and rings the target', async () => {
    resolveAssetUrl.mockResolvedValue('blob:diagram');
    const occlusion = makeOcclusion();
    render(<OcclusionStudyFace card={makeCard('l1')} occlusion={occlusion} side="front" />);

    const img = await screen.findByRole('img', { name: 'Plant cell' });
    expect(img).toBeInTheDocument();

    const l1 = img.parentElement!.querySelector('[style*="left: 10%"]');
    const l2 = img.parentElement!.querySelectorAll('.absolute')[1];
    // Both label regions are present as masked overlays; only l1 (the target) carries a "?".
    expect(img.parentElement!.querySelectorAll('.absolute')).toHaveLength(2);
    expect(l1?.textContent).toBe('?');
    expect(l2.textContent).toBe('');
  });

  it('lifts exactly one mask on the back of a label card', async () => {
    resolveAssetUrl.mockResolvedValue('blob:diagram');
    const occlusion = makeOcclusion();
    render(<OcclusionStudyFace card={makeCard('l1')} occlusion={occlusion} side="back" />);

    const img = await screen.findByRole('img', { name: 'Plant cell' });
    const overlays = img.parentElement!.querySelectorAll('.absolute');
    expect(overlays).toHaveLength(2);
    // l1 (lifted) shows no "?"; l2 (still masked) shows none either — only the
    // ringed/unlifted target carries a "?", and l1 is no longer ringed once lifted.
    overlays.forEach((overlay) => expect(overlay.textContent).toBe(''));
  });

  it('a paired feature card lifts its paired label, not itself, and keeps its own ring', async () => {
    resolveAssetUrl.mockResolvedValue('blob:diagram');
    const occlusion = makeOcclusion();
    render(<OcclusionStudyFace card={makeCard('f1')} occlusion={occlusion} side="back" />);

    const img = await screen.findByRole('img', { name: 'Plant cell' });
    const overlays = img.parentElement!.querySelectorAll('.absolute');
    // l1 (lifted), l2 (still masked), f1 (unmasked ring) — three overlays this time,
    // since the feature target itself is drawn even though it was never masked.
    expect(overlays).toHaveLength(3);
  });

  it("shows an unpaired feature's answerText on the back instead of lifting a mask", async () => {
    resolveAssetUrl.mockResolvedValue('blob:diagram');
    const occlusion = makeOcclusion({
      regions: [region('l1', 'label'), region('f2', 'feature', { answerText: 'Mitochondrion' })],
    });
    render(
      <OcclusionStudyFace card={makeCard('f2')} occlusion={occlusion} side="back" />,
    );

    await screen.findByRole('img', { name: 'Plant cell' });
    expect(screen.getByText('Mitochondrion')).toBeInTheDocument();
  });

  it('renders backNote below the image when present', async () => {
    resolveAssetUrl.mockResolvedValue('blob:diagram');
    const occlusion = makeOcclusion({
      regions: [region('l1', 'label', { backNote: 'Controls the cell.' })],
    });
    render(<OcclusionStudyFace card={makeCard('l1')} occlusion={occlusion} side="back" />);

    await screen.findByRole('img', { name: 'Plant cell' });
    expect(screen.getByText('Controls the cell.')).toBeInTheDocument();
  });

  it("falls back to the card's plain text when the region no longer exists in the occlusion", async () => {
    const occlusion = makeOcclusion({ regions: [region('l2', 'label')] });
    render(
      <OcclusionStudyFace
        card={makeCard('l1', { front: 'Label 1 of 3 — Plant cell' })}
        occlusion={occlusion}
        side="front"
      />,
    );
    expect(await screen.findByText('Label 1 of 3 — Plant cell')).toBeInTheDocument();
    expect(resolveAssetUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it("falls back to the card's plain text when the diagram asset is missing", async () => {
    resolveAssetUrl.mockResolvedValue(null);
    const occlusion = makeOcclusion();
    render(
      <OcclusionStudyFace
        card={makeCard('l1', { front: 'Label 1 of 3 — Plant cell' })}
        occlusion={occlusion}
        side="front"
      />,
    );
    expect(await screen.findByText('Label 1 of 3 — Plant cell')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('resolves the same region to the same relative position at two different container widths', async () => {
    resolveAssetUrl.mockResolvedValue('blob:diagram');
    const occlusion = makeOcclusion();

    const narrow = render(
      <div style={{ width: 320 }}>
        <OcclusionStudyFace card={makeCard('l1')} occlusion={occlusion} side="front" />
      </div>,
    );
    const narrowImg = await screen.findByRole('img', { name: 'Plant cell' });
    const narrowTarget = narrowImg.parentElement!.querySelector('[style*="left: 10%"]') as HTMLElement;
    const narrowStyle = narrowTarget.getAttribute('style');
    narrow.unmount();

    const wide = render(
      <div style={{ width: 1600 }}>
        <OcclusionStudyFace card={makeCard('l1')} occlusion={occlusion} side="front" />
      </div>,
    );
    const wideImg = await screen.findByRole('img', { name: 'Plant cell' });
    const wideTarget = wideImg.parentElement!.querySelector('[style*="left: 10%"]') as HTMLElement;
    const wideStyle = wideTarget.getAttribute('style');
    wide.unmount();

    // The overlay's position is expressed in percentages derived from the stored
    // fraction alone — never pixels — so it is identical regardless of container width.
    expect(narrowStyle).toBe(wideStyle);
    expect(narrowStyle).toContain('left: 10%');
    expect(narrowStyle).toContain('top: 10%');
    expect(narrowStyle).toContain('width: 10%');
    expect(narrowStyle).toContain('height: 10%');
  });
});
