import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/repository';
import { createConcept, setConceptSpecificationPoints } from '../questions/repository';
import { createQuestionSet } from '../questions/questionSetRepository';
import { startConceptPractice } from '../questions/conceptPractice';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';
import { SpecificationStudyFlow } from './SpecificationStudyFlow';

vi.mock('../components/learn/StudyQuestionStep', () => ({
  StudyQuestionStep: ({ conceptId }: { conceptId: string }) => <p>Question for {conceptId}</p>,
}));
beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('skips a wider-scope candidate whose prerequisite is outside the point and serves fresh eligible practice', async () => {
  const course = await createCourse('Scoped questions', {
    unlockMode: 'open',
    specificationData: paperSpecification,
    specificationRef: paperSpecificationReference,
  });
  const blocked = await createConcept(course.id, 'A blocked', { id: 'a-blocked' });
  const ready = await createConcept(course.id, 'B ready', { id: 'b-ready' });
  const outside = await createConcept(course.id, 'Outside', { id: 'c-outside' });
  for (const concept of [blocked, ready])
    await setConceptSpecificationPoints(concept.id, ['example-science:cells']);
  await createQuestionSet({
    id: 'scope-set',
    courseId: course.id,
    title: 'Scoped questions',
    lessonIds: [],
    assessmentIds: [],
    questions: [blocked, ready].map((concept, index) => ({
      id: `question-${index}`,
      prompt: `Explain ${concept.name}`,
      parts: [],
      answer: {
        maxMarks: 1,
        response: { kind: 'written' as const },
        prerequisiteConceptIds: index === 0 ? [outside.id] : [],
        allocations: [
          {
            id: `allocation-${index}`,
            criterion: 'Explains',
            maxMarks: 1,
            dimension: 'application' as const,
            targetConceptIds: [concept.id],
          },
        ],
      },
    })),
  });
  render(
    <MemoryRouter>
      <SpecificationStudyFlow courseId={course.id} pointId="example-science:cells" />
    </MemoryRouter>,
  );
  expect(await screen.findByText(`Question for ${ready.id}`)).toBeVisible();
  expect(screen.queryByText(`Question for ${blocked.id}`)).not.toBeInTheDocument();
  const attempt = await startConceptPractice(course.id, ready.id, {
    scopeConceptIds: [blocked.id, ready.id],
  });
  expect(attempt.selection.questionId).toBe('question-1');
});
