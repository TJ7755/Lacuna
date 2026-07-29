import { describe, expect, it } from 'vitest';
import { diffImport, type ExistingCardForDiff, type ProposedImportItem } from './diffImport';

function existing(overrides: Partial<ExistingCardForDiff> = {}): ExistingCardForDiff {
  return { id: 'card-1', front: 'What is 2+2?', back: '4', tags: [], ...overrides };
}

function item(overrides: Partial<ProposedImportItem> = {}): ProposedImportItem {
  return { front: 'What is 2+2?', back: '4', ...overrides };
}

describe('diffImport', () => {
  it('classifies a brand-new item as toCreate', () => {
    const result = diffImport([], [item({ front: 'New question', back: 'New answer' })]);
    expect(result.toCreate).toHaveLength(1);
    expect(result.toSkip).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
  });

  it('classifies an exact match (same front and back) as toSkip', () => {
    const result = diffImport([existing()], [item()]);
    expect(result.toSkip).toHaveLength(1);
    expect(result.toCreate).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
  });

  it('classifies same front with a different back as toUpdate', () => {
    const result = diffImport([existing()], [item({ back: '5' })]);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]).toMatchObject({ existingCardId: 'card-1', backChanged: true, tagsChanged: false });
  });

  it('classifies same front and back with different tags as toUpdate', () => {
    const result = diffImport(
      [existing({ tags: ['algebra'] })],
      [item({ tags: ['geometry'] })],
    );
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]).toMatchObject({ backChanged: false, tagsChanged: true });
  });

  it('does not flag matching tags in a different order/case as changed', () => {
    const result = diffImport(
      [existing({ tags: ['Algebra', 'Year1'] })],
      [item({ tags: ['year1', 'algebra'] })],
    );
    expect(result.toSkip).toHaveLength(1);
    expect(result.toUpdate).toHaveLength(0);
  });

  it('treats whitespace and case differences in front/back as equivalent (toSkip)', () => {
    const result = diffImport(
      [existing({ front: '  What   is 2+2?  ', back: '4' })],
      [item({ front: 'WHAT IS 2+2?', back: '  4  ' })],
    );
    expect(result.toSkip).toHaveLength(1);
  });

  it.each([
    { name: 'same front, same back (exact duplicate)', second: { front: 'Q1', back: 'A1' } },
    { name: 'same front, different back', second: { front: 'Q1', back: 'A2' } },
    {
      name: 'same front, same back, different tags',
      second: { front: 'Q1', back: 'A1', tags: ['other'] },
    },
  ])('de-duplicates within the same proposed batch: $name', ({ second }) => {
    const result = diffImport(
      [],
      [item({ front: 'Q1', back: 'A1' }), item(second)],
    );
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].back).toBe('A1');
    expect(result.toSkip).toHaveLength(1);
    expect(result.toUpdate).toHaveLength(0);
  });

  it('does not skip within-batch items with genuinely different fronts', () => {
    const result = diffImport(
      [],
      [item({ front: 'Q1', back: 'A1' }), item({ front: 'Q2', back: 'A2' })],
    );
    expect(result.toCreate).toHaveLength(2);
    expect(result.toSkip).toHaveLength(0);
  });

  it('is idempotent across two runs for within-batch same-front-different-back conflicts', () => {
    const proposed = [item({ front: 'Q1', back: 'A1' }), item({ front: 'Q1', back: 'A2' })];
    const first = diffImport([], proposed);
    expect(first.toCreate).toHaveLength(1);
    expect(first.toCreate[0].back).toBe('A1');
    expect(first.toSkip).toHaveLength(1);

    const afterCreate = first.toCreate.map((created, i) => ({
      id: `new-${i}`,
      front: created.front,
      back: created.back,
      tags: created.tags,
    }));
    const second = diffImport(afterCreate, proposed);
    expect(second.toCreate).toHaveLength(0);
    // The first item is now an exact match against the existing card (toSkip); the
    // second still conflicts on front with a different back, so it's reported as
    // toUpdate against the now-existing card rather than silently dropped.
    expect(second.toSkip).toHaveLength(1);
    expect(second.toUpdate).toHaveLength(1);
    expect(second.toUpdate[0]).toMatchObject({ existingCardId: 'new-0', backChanged: true });
  });

  it('is idempotent: re-running diffImport against the previous toCreate output plus the original existing set yields no further creates', () => {
    const existingCards: ExistingCardForDiff[] = [];
    const proposed = [item({ front: 'Q1', back: 'A1' }), item({ front: 'Q2', back: 'A2' })];
    const first = diffImport(existingCards, proposed);
    expect(first.toCreate).toHaveLength(2);

    const afterCreate = first.toCreate.map((created, i) => ({
      id: `new-${i}`,
      front: created.front,
      back: created.back,
      tags: created.tags,
    }));
    const second = diffImport(afterCreate, proposed);
    expect(second.toCreate).toHaveLength(0);
    expect(second.toSkip).toHaveLength(2);
  });

  it('handles markdown-formatted content, matching on normalised text only', () => {
    const result = diffImport(
      [existing({ front: '**Bold** question', back: '4' })],
      [item({ front: '**Bold** question', back: '4' })],
    );
    expect(result.toSkip).toHaveLength(1);
  });

  it('preserves the original item in every bucket, unmodified', () => {
    const proposed = item({ tags: ['x'] });
    const result = diffImport([], [proposed]);
    expect(result.toCreate[0]).toBe(proposed);
  });
});
