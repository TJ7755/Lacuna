import { describe, expect, it } from 'vitest';
import type { MarkAllocation, QuestionSet } from '@lacuna/core/questions/questionSets';
import type { TechniqueTags } from '@lacuna/core/questions/techniqueTags';
import {
  JEV_CLASSIFY_MAX_QUESTIONS,
  JEV_TEXT_MAX,
  jevTechniqueClassificationRequestSchema,
} from '../jev/protocol';
import { summariseTechniques } from './techniqueSummary';
import { flattenQuestionSet } from './questionSetAuthoring';
import {
  applyClassification,
  classificationRequests,
  classificationSummary,
  classificationTargets,
  classificationTechniques,
  countTaggedKnowledgeAsExamTechnique,
} from './techniqueClassification';

const author = (techniqueIds: string[]): TechniqueTags => ({
  taxonomyId: 'course',
  taxonomyVersion: 1,
  techniqueIds,
  provenance: { source: 'author' },
});
const jev = (techniqueIds: string[], suggestedIds: string[] = []): TechniqueTags => ({
  taxonomyId: 'course',
  taxonomyVersion: 1,
  techniqueIds,
  ...(suggestedIds.length ? { suggestedIds } : {}),
  provenance: { source: 'jev', model: 'jev-old' },
});
const point = (id: string, extra: Partial<MarkAllocation> = {}): MarkAllocation => ({
  id,
  criterion: `${id} criterion`,
  maxMarks: 1,
  dimension: 'knowledge',
  targetConceptIds: [],
  ...extra,
});
const answer = (allocations: MarkAllocation[]) => ({
  maxMarks: allocations.length,
  response: { kind: 'written' as const },
  prerequisiteConceptIds: [],
  allocations,
});

function fixture(): QuestionSet {
  return {
    id: 'set',
    courseId: 'course',
    title: 'Forces',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'q1',
        prompt: 'A trolley moves.',
        parts: [
          {
            id: 'q1a',
            prompt: 'Calculate its speed.',
            subparts: [],
            answer: answer([
              point('setup'),
              point('decided', { techniqueTags: author(['substitution']) }),
              point('blank', { criterion: '   ' }),
            ]),
          },
        ],
      },
      {
        id: 'q2',
        prompt: 'Explain the slowing.',
        parts: [],
        answer: answer([
          point('cause', { dimension: 'mixed', techniqueTags: jev(['substitution']) }),
        ]),
      },
    ],
  };
}

const allocation = (set: QuestionSet, id: string) =>
  flattenQuestionSet(set)
    .flatMap((row) => row.node.answer?.allocations ?? [])
    .find((row) => row.id === id)!;

describe('technique classification', () => {
  it('targets undecided points with their parent prompts and skips blank criteria', () => {
    const targets = classificationTargets(fixture());
    expect(targets.map((target) => target.pointId)).toEqual(['setup', 'cause']);
    expect(targets[0]).toMatchObject({
      nodeId: 'q1a',
      point: { prompt: 'A trolley moves.\n\nCalculate its speed.', criterion: 'setup criterion' },
    });
  });

  it('sends only active techniques and keeps every request within the question budget', () => {
    const techniques = classificationTechniques([
      { id: 'calculation-setup', name: 'Set up a calculation', description: 'Write the equation.' },
      { id: 'substitution', name: 'Substitute values', archived: true },
      { id: 'causal-link', name: 'Link cause and effect' },
    ]);
    expect(techniques).toEqual([
      { id: 'calculation-setup', name: 'Set up a calculation', description: 'Write the equation.' },
      { id: 'causal-link', name: 'Link cause and effect' },
    ]);
    const targets = Array.from({ length: 150 }, (_, index) => ({
      nodeId: 'q',
      pointId: `p${index}`,
      point: { prompt: 'Prompt', criterion: `Criterion ${index}`, explanation: '', maxMarks: 1 },
    }));
    const chunks = classificationRequests(targets, techniques);
    expect(chunks.flat()).toHaveLength(150);
    for (const chunk of chunks)
      expect(chunk.length * techniques.length).toBeLessThanOrEqual(JEV_CLASSIFY_MAX_QUESTIONS);
    expect(classificationRequests(targets, [])).toEqual([]);
  });

  it('replaces earlier Jev choices but never a decision, a reworded point or a deleted one', () => {
    const set = fixture();
    const [setup, cause] = classificationTargets(set);
    const reworded = {
      target: { ...cause!, point: { ...cause!.point, criterion: 'what Jev read before' } },
      techniqueIds: ['causal-link'],
      suggestedIds: [],
    };
    const result = applyClassification(
      set,
      [
        { target: setup!, techniqueIds: ['calculation-setup'], suggestedIds: ['substitution'] },
        {
          target: { ...setup!, pointId: 'decided' },
          techniqueIds: ['causal-link'],
          suggestedIds: [],
        },
        { target: { ...setup!, pointId: 'gone' }, techniqueIds: ['causal-link'], suggestedIds: [] },
        reworded,
      ],
      'jev-new',
    );
    expect(result.applied).toEqual(['setup']);
    expect(allocation(result.content, 'setup').techniqueTags).toEqual({
      taxonomyId: 'course',
      taxonomyVersion: 1,
      techniqueIds: ['calculation-setup'],
      suggestedIds: ['substitution'],
      provenance: { source: 'jev', model: 'jev-new' },
    });
    expect(allocation(result.content, 'decided').techniqueTags).toEqual(author(['substitution']));
    expect(allocation(result.content, 'cause').techniqueTags).toEqual(jev(['substitution']));

    const again = applyClassification(
      result.content,
      [{ target: cause!, techniqueIds: [], suggestedIds: [] }],
      'jev-new',
    );
    expect(again.applied).toEqual(['cause']);
    expect(activeTechniqueCount(again.content, 'cause')).toBe(0);
  });

  it('summarises results as they stand and fixes only the classified Knowledge points', () => {
    const set = fixture();
    const [setup, cause] = classificationTargets(set);
    const { content, applied } = applyClassification(
      set,
      [
        { target: setup!, techniqueIds: ['calculation-setup'], suggestedIds: [] },
        { target: cause!, techniqueIds: [], suggestedIds: ['causal-link'] },
      ],
      'jev-new',
    );
    const ids = new Set(applied);
    expect(classificationSummary(content, ids)).toEqual({
      classified: 2,
      tagged: 1,
      unsure: 1,
      knowledge: 1,
    });
    const fixed = countTaggedKnowledgeAsExamTechnique(content, ids);
    expect(allocation(fixed, 'setup').dimension).toBe('exam-execution');
    // The author's own Knowledge point is outside this classification and is left alone.
    expect(allocation(fixed, 'decided').dimension).toBe('knowledge');
    expect(classificationSummary(fixed, ids).knowledge).toBe(0);
  });
});

function activeTechniqueCount(set: QuestionSet, id: string) {
  return allocation(set, id).techniqueTags?.techniqueIds.length ?? 0;
}

describe('row summary', () => {
  it('reports pending suggestions even when the technique is confirmed on another point', () => {
    const catalogue = [{ id: 'causal-link' as const, name: 'Link cause and effect' }];
    const summary = summariseTechniques(
      [
        point('a', { techniqueTags: jev([], ['causal-link']) }),
        point('b', { dimension: 'mixed', techniqueTags: jev(['causal-link']) }),
      ],
      catalogue,
    );
    expect(summary).toEqual({
      active: ['Link cause and effect'],
      unsure: [],
      pending: 1,
      knowledgeTagged: 0,
    });
  });
});

describe('request limits', () => {
  it('clips long context from the start and skips criteria Jev could not be sent', () => {
    const set = fixture();
    set.questions[0]!.prompt = `${'s'.repeat(JEV_TEXT_MAX)}END-OF-STEM`;
    const allocations = set.questions[0]!.parts[0]!.answer!.allocations;
    allocations[0] = { ...allocations[0]!, explanation: 'e'.repeat(JEV_TEXT_MAX + 5) };
    allocations.push(point('huge', { criterion: 'c'.repeat(JEV_TEXT_MAX + 1) }));
    const targets = classificationTargets(set);
    expect(targets.map((target) => target.pointId)).toEqual(['setup', 'cause']);
    const setup = targets[0]!.point;
    expect(setup.prompt).toHaveLength(JEV_TEXT_MAX);
    expect(setup.prompt.endsWith('Calculate its speed.')).toBe(true);
    expect(setup.explanation).toHaveLength(JEV_TEXT_MAX);
    expect(() =>
      jevTechniqueClassificationRequestSchema.parse({
        purpose: 'technique-classification',
        techniques: [{ id: 'causal-link', name: 'Link cause and effect' }],
        points: targets.map((target) => target.point),
      }),
    ).not.toThrow();
  });
});
