import { describe, expect, it } from 'vitest';
import type { Specification } from '@lacuna/core/specifications/catalogue';
import { resolveSpecPointTags, unavailableSpecificationPointLinks } from './tagResolver';

const specification: Specification = {
  id: 'fixture-science',
  board: 'aqa',
  qualification: 'gcse',
  code: 'TEST1',
  title: 'Synthetic specification',
  firstExamination: 2028,
  source: { document: 'Fixture', issue: '1', url: 'https://example.com/specification' },
  tiers: [{ id: 'higher', name: 'Higher' }],
  routes: [{ id: 'route-a', name: 'Route A' }],
  assessmentObjectives: [],
  commandWords: [],
  points: [
    { id: '1', ref: '1', title: 'Topic', parentId: null, kind: 'content' },
    { id: '1.1', ref: '1.1', title: 'Core', parentId: '1', kind: 'content' },
    {
      id: '1.2h',
      ref: '1.2H',
      title: 'Higher',
      parentId: '1',
      kind: 'content',
      appliesTo: { tiers: ['higher'] },
    },
    {
      id: '1.3',
      ref: '1.3',
      title: 'Route',
      parentId: '1',
      kind: 'content',
      appliesTo: { routes: ['route-a'] },
    },
  ],
  papers: [
    {
      id: 'paper-1',
      ref: '1',
      title: 'Paper',
      durationMinutes: 60,
      totalMarks: 60,
      pointIds: 'all',
    },
  ],
};

describe('resolveSpecPointTags', () => {
  it('resolves references and case-insensitive qualification codes without modifying Cards', () => {
    const cards = [
      { id: 'card-1', conceptId: 'concept-1', tags: ['biology', 'spec:1.1', 'spec:test1:1.2H'] },
    ];
    const before = structuredClone(cards);
    expect(resolveSpecPointTags(cards, specification)).toEqual({
      matched: [
        {
          cardId: 'card-1',
          conceptId: 'concept-1',
          tag: 'spec:1.1',
          specificationPointId: 'fixture-science:1.1',
        },
        {
          cardId: 'card-1',
          conceptId: 'concept-1',
          tag: 'spec:test1:1.2H',
          specificationPointId: 'fixture-science:1.2h',
        },
      ],
      ambiguous: [],
      unmatched: [],
    });
    expect(cards).toEqual(before);
  });

  it('reports every candidate for an ambiguous published reference rather than guessing', () => {
    const ambiguous = {
      ...specification,
      points: [...specification.points, { ...specification.points[1], id: 'alternate' }],
    };
    expect(resolveSpecPointTags([{ id: 'card', tags: ['spec:1.1'] }], ambiguous)).toEqual({
      matched: [],
      ambiguous: [
        {
          cardId: 'card',
          tag: 'spec:1.1',
          specificationPointIds: ['fixture-science:1.1', 'fixture-science:alternate'],
        },
      ],
      unmatched: [],
    });
  });

  it('retains unknown, foreign-code and malformed spec tags and ignores ordinary tags', () => {
    const tags = ['spec:missing', 'spec:OTHER:1.1', 'spec:', 'spec:TEST1:1.1:extra', 'ordinary'];
    expect(resolveSpecPointTags([{ id: 'card', tags }], specification)).toEqual({
      matched: [],
      ambiguous: [],
      unmatched: tags.slice(0, 4).map((tag) => ({ cardId: 'card', tag })),
    });
  });

  it('coalesces repeated tags per Card and keeps separate Cards and absent tags independent', () => {
    expect(
      resolveSpecPointTags(
        [
          { id: 'one', tags: ['spec:1.1', 'spec:1.1'] },
          { id: 'two', tags: ['spec:1.1'] },
          { id: 'three' },
        ],
        specification,
      ).matched.map(({ cardId }) => cardId),
    ).toEqual(['one', 'two']);
  });
});

describe('unavailableSpecificationPointLinks', () => {
  it('reports foreign, missing and out-of-selection links without removing stored values', () => {
    const links = [
      'fixture-science:1.1',
      'fixture-science:1.2h',
      'fixture-science:1.3',
      'fixture-science:missing',
      'other:1.1',
    ];
    const before = [...links];
    expect(unavailableSpecificationPointLinks(links, specification, {})).toEqual([
      { specificationPointId: 'fixture-science:1.2h', reason: 'outside-selection' },
      { specificationPointId: 'fixture-science:1.3', reason: 'outside-selection' },
      { specificationPointId: 'fixture-science:missing', reason: 'unknown-point' },
      { specificationPointId: 'other:1.1', reason: 'other-specification' },
    ]);
    expect(
      unavailableSpecificationPointLinks(links.slice(0, 3), specification, {
        tier: 'higher',
        routeIds: ['route-a'],
      }),
    ).toEqual([]);
    expect(links).toEqual(before);
  });
});
