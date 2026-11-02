import { describe, expect, it } from 'vitest';
import {
  activeTechniqueIds,
  classifiedTechniqueTags,
  courseTechniqueTagsSchema,
  courseTechniquesSchema,
  decideTechnique,
  effectiveCourseTechniques,
  suggestedTechniqueIds,
  techniqueName,
  techniqueTagsSchema,
  type TechniqueTags,
} from '@lacuna/core/questions/techniqueTags';
import { diagnosticRequestForTags } from '@lacuna/core/jev/diagnosis';

const custom = 'custom-abcdefgh1';
const jev = (techniqueIds: string[], suggestedIds?: string[]): TechniqueTags => ({
  taxonomyId: 'course',
  taxonomyVersion: 1,
  techniqueIds,
  ...(suggestedIds ? { suggestedIds } : {}),
  provenance: { source: 'jev', model: 'jev-1.14.0' },
});

describe('course technique catalogue', () => {
  it('accepts built-in and namespaced custom identities and rejects collisions', () => {
    expect(
      courseTechniquesSchema.parse([
        { id: 'calculation-setup', name: 'Set up a calculation' },
        { id: custom, name: 'Quote the data', description: 'Cite a value from the table.' },
      ]),
    ).toHaveLength(2);
    expect(() => courseTechniquesSchema.parse([{ id: 'invented', name: 'Invented' }])).toThrow();
    expect(() =>
      courseTechniquesSchema.parse([
        { id: custom, name: 'Quote the data' },
        { id: 'custom-zyxwvuts2', name: ' quote the DATA ' },
      ]),
    ).toThrow();
    // An archived technique may share a name with its active replacement.
    expect(
      courseTechniquesSchema.parse([
        { id: custom, name: 'Quote the data', archived: true },
        { id: 'custom-zyxwvuts2', name: 'Quote the data' },
      ]),
    ).toHaveLength(2);
  });

  it('adds referenced built-ins without overriding stored entries', () => {
    const catalogue = effectiveCourseTechniques(
      [{ id: 'substitution', name: 'Plug in numbers', archived: true }],
      ['substitution', 'causal-link', custom],
    );
    expect(catalogue.map((row) => [row.id, row.name])).toEqual([
      ['substitution', 'Plug in numbers'],
      ['causal-link', 'Link cause and effect'],
    ]);
    expect(techniqueName(catalogue, 'substitution')).toBe('Plug in numbers');
    expect(techniqueName(catalogue, 'unit-conversion')).toBe('Convert units');
    expect(techniqueName(catalogue, custom)).toBe('Removed technique');
  });
});

describe('course technique tags', () => {
  it('rejects duplicate or overlapping active and suggested identities', () => {
    expect(courseTechniqueTagsSchema.safeParse(jev([custom], ['causal-link'])).success).toBe(true);
    expect(courseTechniqueTagsSchema.safeParse(jev([custom], [custom])).success).toBe(false);
    expect(courseTechniqueTagsSchema.safeParse(jev([custom, custom])).success).toBe(false);
    expect(techniqueTagsSchema.safeParse(jev(['not-a-technique'])).success).toBe(false);
  });

  it('schedules only active identities; legacy Jev tags remain suggestions', () => {
    expect(activeTechniqueIds(jev([custom], ['causal-link']))).toEqual([custom]);
    expect(suggestedTechniqueIds(jev([custom], ['causal-link']))).toEqual(['causal-link']);
    const legacyJev: TechniqueTags = {
      taxonomyId: 'science-techniques',
      taxonomyVersion: 1,
      techniqueIds: ['substitution'],
      provenance: { source: 'jev', model: 'old' },
    };
    expect(activeTechniqueIds(legacyJev)).toEqual([]);
    expect(suggestedTechniqueIds(legacyJev)).toEqual(['substitution']);
    expect(activeTechniqueIds({ ...legacyJev, provenance: { source: 'author' } })).toEqual([
      'substitution',
    ]);
  });

  it('records a manual decision while keeping the other suggestions for review', () => {
    const tags = decideTechnique(jev([], ['causal-link', custom]), custom, true);
    expect(tags).toEqual({
      taxonomyId: 'course',
      taxonomyVersion: 1,
      techniqueIds: [custom],
      suggestedIds: ['causal-link'],
      provenance: { source: 'author' },
    });
    expect(decideTechnique(tags, 'causal-link', false)).toEqual({
      ...tags,
      suggestedIds: undefined,
    });
  });

  it('lets classification replace Jev choices but never a manual decision', () => {
    const manual = decideTechnique(undefined, custom, true);
    expect(
      classifiedTechniqueTags(manual, { techniqueIds: [], suggestedIds: [] }, 'jev-1.14.0'),
    ).toBe(manual);
    expect(
      classifiedTechniqueTags(
        jev([custom]),
        { techniqueIds: ['causal-link'], suggestedIds: ['causal-link', custom] },
        'jev-1.14.0',
      ),
    ).toEqual(jev(['causal-link'], [custom]));
  });

  it('asks Jev to diagnose only active built-in techniques', () => {
    expect(
      diagnosticRequestForTags(
        decideTechnique(decideTechnique(undefined, custom, true), 'substitution', true),
      ),
    ).toEqual({
      taxonomyId: 'science-techniques',
      taxonomyVersion: 1,
      techniqueIds: ['substitution'],
    });
    expect(diagnosticRequestForTags(jev([custom], ['substitution']))).toBeUndefined();
    expect(diagnosticRequestForTags(undefined)).toBeUndefined();
  });
});
