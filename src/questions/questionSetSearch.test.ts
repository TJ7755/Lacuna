import { describe, expect, it } from 'vitest';
import staticBank from '../../docs/question-bank/examples/static-multipart.json';
import familyBank from '../../docs/question-bank/examples/numeric-family.json';
import { materialiseQuestionBank, parseQuestionBank } from './bank';
import { searchQuestionSets } from './questionSetSearch';
import type { QuestionSet } from './questionSets';

const answer = {
  maxMarks: 1,
  prerequisiteConceptIds: ['prerequisite-id'],
  response: {
    kind: 'multiple-choice' as const,
    selection: 'single' as const,
    options: [{ id: 'option-id', content: 'Semi-permeable membrane' }],
    correctOptionIds: ['option-id'],
  },
  allocations: [
    {
      id: 'allocation-id',
      criterion: 'Secret criterion',
      explanation: 'Hidden explanation',
      maxMarks: 1,
      dimension: 'knowledge' as const,
      targetConceptIds: ['target-id'],
    },
  ],
};
const set: QuestionSet = {
  id: 'set-id',
  courseId: 'course',
  title: 'Practice paper',
  lessonIds: ['lesson-id'],
  assessmentIds: [],
  questions: [
    {
      id: 'q1',
      prompt: 'Consider the **cell**.',
      parts: [
        {
          id: 'part-id',
          prompt: 'Describe diffusion.',
          subparts: [{ id: 'subpart-id', prompt: 'Explain the concentration gradient.', answer }],
        },
      ],
    },
  ],
};
const context = {
  lessons: [{ id: 'lesson-id', name: 'Transport systems' }],
  concepts: [
    { id: 'target-id', name: 'Osmosis' },
    { id: 'prerequisite-id', name: 'Particle movement' },
  ],
};

describe('question-set search', () => {
  it.each([
    ['practice', 'Title'],
    ['cell', 'Question 1'],
    ['diffusion', 'Question 1(a)'],
    ['concentration gradient', 'Question 1(a)(i)'],
    ['SEMI permeable', 'Question 1(a)(i) option'],
    ['transport', 'Lesson / Concept'],
    ['osmosis', 'Lesson / Concept'],
    ['particle movement', 'Lesson / Concept'],
  ])('finds %s with its best location', (query, location) => {
    expect(searchQuestionSets([set], query, context)).toMatchObject([{ content: set, location }]);
  });

  it('normalises whitespace and punctuation and combines words across fields', () => {
    expect(
      searchQuestionSets([set], '  PRACTICE\n osmosis, semi-permeable  ', context),
    ).toHaveLength(1);
    expect(searchQuestionSets([set], 'osmosis absent', context)).toEqual([]);
  });

  it('keeps input ordering and returns each identity once even with several matches', () => {
    const other = { ...set, id: 'other' };
    expect(searchQuestionSets([other, set, set], 'cell').map((hit) => hit.content.id)).toEqual([
      'other',
      'set-id',
    ]);
    expect(searchQuestionSets([other, set], '  ').map((hit) => hit.content.id)).toEqual([
      'other',
      'set-id',
    ]);
  });

  it('searches readable labels and image descriptions without exposing markup or destinations', () => {
    const content = {
      ...set,
      questions: [
        {
          id: 'q',
          parts: [],
          prompt:
            '## **Cells** [transport](https://example.test/private) ![Membrane diagram](asset:private-id)\n' +
            '[osmosis][ref]\n[ref]: https://example.test/secret\n<img src="asset:hidden-id" alt="Diffusion">',
        },
      ],
    };
    const [hit] = searchQuestionSets([content], 'cells osmosis diffusion membrane');
    expect(hit.excerpt).toBe('Cells transport Membrane diagram osmosis Diffusion');
    for (const query of ['private', 'secret', 'hidden-id', 'ref'])
      expect(searchQuestionSets([content], query)).toEqual([]);
  });

  it('uses wikilink labels and removes block Markdown syntax', () => {
    const content = {
      ...set,
      questions: [
        {
          id: 'q',
          parts: [],
          prompt: 'Cell transport\n---\n[[internal-note-id|Membranes]]\n```text\nDiffusion\n```',
        },
      ],
    };
    expect(searchQuestionSets([content], 'membranes')[0].excerpt).toBe(
      'Cell transport Membranes Diffusion',
    );
    expect(searchQuestionSets([content], 'internal-note-id')).toEqual([]);
  });

  it('never searches marking, explanations, correct-option identities or internal identities', () => {
    for (const query of [
      'secret criterion',
      'hidden explanation',
      'option-id',
      'target-id',
      'set-id',
    ])
      expect(searchQuestionSets([set], query, context)).toEqual([]);
  });

  it('searches all available bank blueprint/source fields and Concept names', () => {
    const [bankSet] = materialiseQuestionBank(parseQuestionBank(staticBank), 'course');
    for (const text of [
      ...Object.values(bankSet.bank!.blueprint),
      ...Object.values(bankSet.bank!.source),
      bankSet.bank!.concepts[0].name,
    ]) {
      expect(searchQuestionSets([bankSet], text)).toHaveLength(1);
    }
  });

  it('searches stored family template wording without generating variants', () => {
    const [family] = materialiseQuestionBank(parseQuestionBank(familyBank), 'course');
    family.bank!.family!.template.questions[0].prompt = 'Unmaterialised template wording';
    expect(searchQuestionSets([family], 'unmaterialised')).toMatchObject([
      { location: 'Template: Question 1', excerpt: 'Unmaterialised template wording' },
    ]);
  });
});
