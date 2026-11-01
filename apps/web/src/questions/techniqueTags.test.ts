import { describe, expect, it } from 'vitest';
import staticExample from '../../../../docs/question-bank/examples/static-multipart.json';
import { parseQuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import { validateQuestionSet } from '@lacuna/core/questions/questionSets';

function record(techniqueTags?: unknown) {
  const { source: _source, blueprint: _blueprint, ...set } = structuredClone(staticExample.sets[0]);
  return {
    ...set,
    courseId: 'course-1',
    lessonIds: [],
    assessmentIds: [],
    contentVersion: 1,
    contentRevisionId: 'revision-1',
    createdAt: 1,
    updatedAt: 1,
    questions: set.questions.map((question) => ({
      ...question,
      parts: question.parts.map((part) => ({
        ...part,
        answer: {
          ...part.answer,
          allocations: part.answer.allocations.map((allocation) => ({
            ...allocation,
            ...(techniqueTags === undefined ? {} : { techniqueTags }),
          })),
        },
      })),
    })),
  };
}

const tags = {
  taxonomyId: 'science-explanations',
  taxonomyVersion: 1,
  techniqueIds: ['causal-link'],
  provenance: { source: 'author' },
};

describe('criterion technique tags', () => {
  it.each([
    undefined,
    tags,
    {
      ...tags,
      taxonomyId: 'science-techniques',
      techniqueIds: ['causal-link', 'paired-comparison'],
    },
    { ...tags, techniqueIds: [] },
    { ...tags, provenance: { source: 'jev', model: 'reviewed-model' } },
  ])('retains legacy, explicit none and attributed classification: %j', (classification) => {
    const parsed = parseQuestionSetRecord(record(classification));
    expect(parsed.questions[0].parts[0].answer!.allocations[0].techniqueTags).toEqual(
      classification,
    );
    expect(validateQuestionSet(parsed)).toEqual([]);
  });

  it.each([
    { ...tags, taxonomyId: 'unknown' },
    { ...tags, taxonomyVersion: 2 },
    { ...tags, techniqueIds: ['invented-skill'] },
    { ...tags, techniqueIds: ['causal-link', 'causal-link'] },
    {
      ...tags,
      taxonomyId: 'science-techniques',
      techniqueIds: ['paired-comparison', 'paired-comparison'],
    },
    { ...tags, techniqueIds: ['paired-comparison'] },
    { ...tags, provenance: { source: 'jev' } },
    { ...tags, provenance: { source: 'author', model: 'invented' } },
    { ...tags, learnerMastery: 1 },
  ])('rejects unsupported or malformed classification: %j', (classification) => {
    expect(() => parseQuestionSetRecord(record(classification))).toThrow();
  });
});
