import { describe, expect, it } from 'vitest';
import {
  buildCatalogue,
  paperPoints,
  papersForSelection,
  parseSpecification,
  pointsForSelection,
  type Specification,
} from './catalogue';

/** Synthetic fixture, not real specification content. */
function fixture(overrides: Partial<Specification> = {}): Specification {
  return {
    id: 'example-board-fixture',
    board: 'aqa',
    qualification: 'gcse',
    code: 'TEST1',
    title: 'Fixture Science',
    firstExamination: 2027,
    source: {
      document: 'Fixture specification',
      issue: 'Issue 1',
      url: 'https://example.com/spec.pdf',
    },
    tiers: [
      { id: 'foundation', name: 'Foundation' },
      { id: 'higher', name: 'Higher' },
    ],
    routes: [
      { id: 'route-a', name: 'Route A' },
      { id: 'route-b', name: 'Route B' },
    ],
    assessmentObjectives: [
      { id: 'AO1', description: 'Recall', weightingPercent: 40 },
      { id: 'AO2', description: 'Apply', weightingPercent: 60 },
    ],
    commandWords: [{ word: 'Explain', meaning: 'Give reasons.' }],
    points: [
      { id: '1', ref: '1', title: 'Topic', parentId: null, kind: 'content' },
      { id: '1.1', ref: '1.1', title: 'Core idea', parentId: '1', kind: 'content' },
      {
        id: '1.2',
        ref: '1.2H',
        title: 'Higher idea',
        parentId: '1',
        kind: 'content',
        appliesTo: { tiers: ['higher'] },
      },
      {
        id: '2',
        ref: '2',
        title: 'Option',
        parentId: null,
        kind: 'content',
        appliesTo: { routes: ['route-b'] },
      },
      { id: 'word-1', ref: 'V1', title: 'word', parentId: null, kind: 'vocabulary' },
    ],
    papers: [
      {
        id: 'paper-1',
        ref: '1',
        title: 'Paper 1',
        durationMinutes: 90,
        totalMarks: 80,
        pointIds: 'all',
      },
      {
        id: 'paper-2h',
        ref: '2H',
        title: 'Paper 2 Higher',
        durationMinutes: 60,
        totalMarks: 60,
        pointIds: ['1.2'],
        appliesTo: { tiers: ['higher'] },
      },
    ],
    ...overrides,
  };
}

function issues(value: unknown): string[] {
  const result = parseSpecification(value);
  return result.ok ? [] : result.issues;
}

describe('parseSpecification', () => {
  it('accepts a valid specification', () => {
    expect(parseSpecification(fixture())).toEqual({ ok: true, specification: fixture() });
  });

  it('rejects unknown fields and malformed ids', () => {
    expect(issues({ ...fixture(), extra: true })).not.toEqual([]);
    expect(issues(fixture({ id: 'Bad Id' }))).not.toEqual([]);
  });

  it('requires parents to precede children', () => {
    const [parent, child, ...rest] = fixture().points;
    expect(issues(fixture({ points: [child, parent, ...rest] }))).toContain(
      'Point 1.1 must follow its parent 1.',
    );
  });

  it('rejects duplicates and dangling references', () => {
    const base = fixture();
    expect(issues(fixture({ points: [...base.points, base.points[0]] }))).toContain(
      'Duplicate point 1.',
    );
    expect(
      issues(
        fixture({
          papers: [{ ...base.papers[0], pointIds: ['missing'], appliesTo: { tiers: ['top'] } }],
        }),
      ),
    ).toEqual([
      'Paper paper-1 names unknown tier top.',
      'Paper paper-1 covers unknown point missing.',
    ]);
    expect(
      issues(fixture({ commandWords: [...base.commandWords, { word: 'explain', meaning: 'x' }] })),
    ).toContain('Duplicate command word explain.');
  });

  it('checks assessment objective weightings only when all are given', () => {
    const [recall, apply] = fixture().assessmentObjectives;
    expect(
      issues(fixture({ assessmentObjectives: [recall, { ...apply, weightingPercent: 50 }] })),
    ).toEqual(['Assessment objective weightings total 90%, not 100%.']);
    expect(
      issues(fixture({ assessmentObjectives: [recall, { id: 'AO2', description: 'Apply' }] })),
    ).toEqual([]);
  });
});

describe('buildCatalogue', () => {
  it('indexes valid entries and rejects invalid or duplicate ones', () => {
    expect(buildCatalogue([fixture()]).get('example-board-fixture')?.code).toBe('TEST1');
    expect(() => buildCatalogue([fixture(), fixture()])).toThrow(
      'Duplicate specification example-board-fixture.',
    );
    expect(() => buildCatalogue([fixture({ papers: [] })])).toThrow('Specification 0 is invalid');
  });
});

describe('selection', () => {
  const spec = fixture();
  const ids = (items: { id: string }[]) => items.map((item) => item.id);

  it('filters points by tier and route', () => {
    expect(ids(pointsForSelection(spec, { tier: 'foundation' }))).toEqual(['1', '1.1', 'word-1']);
    expect(ids(pointsForSelection(spec, { tier: 'higher', routeIds: ['route-b'] }))).toEqual([
      '1',
      '1.1',
      '1.2',
      '2',
      'word-1',
    ]);
  });

  it('resolves papers and their covered points', () => {
    expect(ids(papersForSelection(spec, { tier: 'foundation' }))).toEqual(['paper-1']);
    const [all, higher] = papersForSelection(spec, { tier: 'higher' });
    expect(ids(paperPoints(spec, all, { tier: 'higher' }))).toEqual(['1', '1.1', '1.2', 'word-1']);
    expect(ids(paperPoints(spec, higher, { tier: 'higher' }))).toEqual(['1.2']);
  });
});
