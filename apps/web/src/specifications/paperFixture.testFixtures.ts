import type { Specification } from '@lacuna/core/specifications/catalogue';

export const paperSpecification: Specification = {
  id: 'example-science',
  board: 'aqa',
  qualification: 'gcse',
  code: 'EXAMPLE',
  title: 'Synthetic science',
  firstExamination: 2027,
  source: { document: 'Synthetic specification', issue: '1', url: 'https://example.test/spec' },
  tiers: [
    { id: 'higher', name: 'Higher' },
    { id: 'foundation', name: 'Foundation' },
  ],
  routes: [{ id: 'written', name: 'Written papers' }],
  assessmentObjectives: [],
  commandWords: [],
  points: [
    { id: 'cells', ref: '1', title: 'Cells', parentId: null, kind: 'content' },
    {
      id: 'enzymes',
      ref: '2',
      title: 'Enzymes',
      parentId: null,
      kind: 'content',
      appliesTo: { tiers: ['higher'] },
    },
    { id: 'practical', ref: '3', title: 'Practical methods', parentId: null, kind: 'content' },
  ],
  papers: [
    {
      id: 'paper-1',
      ref: '1',
      title: 'First paper',
      durationMinutes: 60,
      totalMarks: 50,
      pointIds: ['cells', 'practical'],
    },
    {
      id: 'paper-2',
      ref: '2',
      title: 'Second paper',
      durationMinutes: 60,
      totalMarks: 50,
      pointIds: 'all',
      appliesTo: { routes: ['written'] },
    },
  ],
};

export const paperSpecificationReference = {
  specificationId: paperSpecification.id,
  tier: 'higher',
  routeIds: ['written'],
};
