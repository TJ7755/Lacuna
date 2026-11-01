import { describe, expect, it } from 'vitest';
import staticBank from '../../../../docs/question-bank/examples/static-multipart.json';
import familyBank from '../../../../docs/question-bank/examples/numeric-family.json';
import { materialiseQuestionBank, parseQuestionBank } from './bank';
import { searchQuestionSets } from './questionSetSearch';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';

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

  it('excludes marking and explanations by default, including cross-field queries', () => {
    for (const query of [
      'secret criterion',
      'hidden explanation',
      'option-id',
      'target-id',
      'set-id',
      'cell hidden',
    ])
      expect(searchQuestionSets([set], query, context)).toEqual([]);
  });

  it.each([
    ['secret criterion', 'Mark scheme: Question 1(a)(i) criterion', 'Secret criterion'],
    ['hidden explanation', 'Mark scheme: Question 1(a)(i) explanation', 'Hidden explanation'],
  ])('finds authorised %s matches with a labelled location', (query, location, excerpt) => {
    expect(searchQuestionSets([set], query, context, { includeMarkScheme: true })).toMatchObject([
      { content: set, location, excerpt },
    ]);
    expect(searchQuestionSets([set], query, context, { includeMarkScheme: false })).toEqual([]);
  });

  it('combines authorised words across fields and retains order and deduplication', () => {
    const other = { ...set, id: 'other' };
    expect(
      searchQuestionSets([other, set, set], 'cell hidden explanation', context, {
        includeMarkScheme: true,
      }).map((hit) => [hit.content.id, hit.location]),
    ).toEqual([
      ['other', 'Mark scheme: Question 1(a)(i) explanation'],
      ['set-id', 'Mark scheme: Question 1(a)(i) explanation'],
    ]);
  });

  it('searches every allocation at question, part and subpart depth without Markdown noise', () => {
    const content = structuredClone(set);
    content.questions[0].answer = answer;
    content.questions[0].parts[0].answer = answer;
    content.questions[0].parts[0].subparts[0].answer!.allocations.push({
      ...answer.allocations[0],
      id: 'second-allocation',
      criterion: '**Accept** [alternatives](https://example.test/private-criterion)',
      explanation: '![Worked diagram](asset:private-explanation)',
    });
    for (const query of ['accept alternatives', 'worked diagram']) {
      expect(searchQuestionSets([content], query, {}, { includeMarkScheme: true })).toHaveLength(1);
      expect(searchQuestionSets([content], query)).toEqual([]);
    }
    for (const query of [
      'private-criterion',
      'private-explanation',
      'allocation-id',
      'option-id',
    ]) {
      expect(searchQuestionSets([content], query, {}, { includeMarkScheme: true })).toEqual([]);
    }
    expect(
      searchQuestionSets([content], 'secret criterion', {}, { includeMarkScheme: true })[0]
        .location,
    ).toBe('Mark scheme: Question 1 criterion');
    delete content.questions[0].answer;
    expect(
      searchQuestionSets([content], 'secret criterion', {}, { includeMarkScheme: true })[0]
        .location,
    ).toBe('Mark scheme: Question 1(a) criterion');
  });

  it('never puts answer-only text in learner excerpts for public or empty queries', () => {
    for (const query of ['', 'cell', 'semi permeable']) {
      const [hit] = searchQuestionSets([set], query, context);
      expect(hit).toBeDefined();
      expect(hit.excerpt).not.toMatch(/secret|hidden/i);
    }
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
  it('searches representative and template marking once without expanding unseen family variants', () => {
    const [family] = materialiseQuestionBank(parseQuestionBank(familyBank), 'course');
    family.bank!.family!.template.questions[0].answer!.allocations[0].criterion =
      'Template criterion: density from mass and volume';
    const original = structuredClone(family);
    for (const [query, location] of [
      ['density 12 2 6', 'Mark scheme: Question 1 criterion'],
      ['template criterion', 'Mark scheme: Template: Question 1 criterion'],
    ]) {
      expect(searchQuestionSets([family], query, {}, { includeMarkScheme: true })).toMatchObject([
        { content: family, location },
      ]);
      expect(searchQuestionSets([family], query)).toEqual([]);
    }
    family.bank!.family!.template.questions[0].answer!.allocations[0].explanation =
      'Unmaterialised worked explanation';
    expect(
      searchQuestionSets([family], 'unmaterialised worked', {}, { includeMarkScheme: true }),
    ).toMatchObject([{ location: 'Mark scheme: Template: Question 1 explanation' }]);
    expect(searchQuestionSets([family], 'unmaterialised worked')).toEqual([]);
    expect(searchQuestionSets([family], '24 4 6', {}, { includeMarkScheme: true })).toEqual([]);
    delete family.bank!.family!.template.questions[0].answer!.allocations[0].explanation;
    expect(family).toEqual(original);
  });
});
