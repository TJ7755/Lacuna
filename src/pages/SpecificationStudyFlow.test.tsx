import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { makeCard, makeCourse, makeLesson } from '../course/path.testFixtures';
import type { ConceptPracticeItem } from '../questions/conceptPractice';
import { emptyQuestionSchedule } from '../questions/scheduler';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';
import { SpecificationStudyFlow } from './SpecificationStudyFlow';

const exposed = { lessonId: 'lesson', cardId: 'cells', taughtAt: 0, updatedAt: 0 };
function fixture() {
  return {
    course: makeCourse({
      id: 'course',
      specificationData: paperSpecification,
      specificationRef: paperSpecificationReference,
    }),
    lessons: [makeLesson({ id: 'lesson', courseId: 'course' })],
    cards: [
      makeCard({
        id: 'cells',
        deckId: 'course',
        courseId: 'course',
        conceptId: 'cells',
        primaryLessonId: 'lesson',
      }),
    ],
    concepts: ['cells', 'enzymes'].map((id) => ({
      id,
      name: id,
      scope: 'course' as const,
      courseId: 'course',
      scopeKey: 'course:course',
      provisional: false,
      specificationPointIds: [`example-science:${id}`],
      createdAt: 0,
      updatedAt: 0,
    })),
    assessments: [],
    links: [],
    exposures: [exposed],
    completions: [],
    practiceNodes: [],
    milestones: [],
    performance: [],
    questionScopeConceptIds: ['cells', 'enzymes'],
    questionPractice: ['enzymes', 'cells'].map((id): ConceptPracticeItem => ({
      conceptId: id,
      name: id,
      schedule: emptyQuestionSchedule(),
      due: true,
      unseenCount: 1,
      familiarCount: 0,
      availableCount: 1,
    })),
  };
}
let records = fixture();

vi.mock('../state/useCourseStudyFlowRecords', () => ({
  useCourseStudyFlowRecords: (_courseId: string, generation: number) => ({
    ...records,
    generation,
  }),
}));
vi.mock('../state/useCourseConceptPractice', () => ({
  useCourseConceptPractice: (_courseId: string, ids: string[]) =>
    records.questionPractice.filter((item) => ids.includes(item.conceptId)),
}));
vi.mock('../components/learn/StudyEntrance', () => ({
  StudyEntrance: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./LearnMode', () => ({
  LearnMode: ({ onStepFinished }: { onStepFinished: () => void }) => (
    <button onClick={onStepFinished}>Finish scoped recall</button>
  ),
}));
vi.mock('../components/learn/StudyQuestionStep', () => ({
  StudyQuestionStep: ({
    conceptId,
    scopeConceptIds,
    onComplete,
  }: {
    conceptId: string;
    scopeConceptIds: string[];
    onComplete: () => void;
  }) => (
    <div>
      <p>Question for {conceptId}</p>
      <p>Permitted topics: {scopeConceptIds.join(', ')}</p>
      <button onClick={onComplete}>Finish scoped question</button>
    </div>
  ),
}));

beforeEach(() => {
  records = fixture();
});

function view(pointId = 'example-science:cells') {
  return (
    <MemoryRouter>
      <SpecificationStudyFlow courseId="course" pointId={pointId} />
    </MemoryRouter>
  );
}

it('continues from recall only to a scoped Question and keeps its scope while evidence changes', () => {
  const page = render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Finish scoped recall' }));
  expect(screen.getByText('Question for cells')).toBeVisible();
  expect(screen.getByText('Permitted topics: cells')).toBeVisible();

  // Starting/marking a Question changes its fresh capacity. That must not replace the active step.
  records = {
    ...records,
    questionPractice: records.questionPractice.filter((item) => item.conceptId !== 'cells'),
  };
  page.rerender(view());
  expect(screen.getByText('Question for cells')).toBeVisible();
  expect(screen.queryByText('Question for enzymes')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Finish scoped question' }));
  expect(screen.getByRole('heading', { name: 'Scoped practice complete' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Finish scoped recall' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Finish scoped question' })).not.toBeInTheDocument();
});

it('ends a valid empty point without starting unrelated practice', () => {
  render(view('example-science:practical'));
  expect(screen.getByRole('heading', { name: 'No practice ready for this point' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Finish scoped recall' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Finish scoped question' })).not.toBeInTheDocument();
});

it('keeps missing metadata unavailable instead of falling through to ordinary Study', () => {
  records.course = { ...records.course, specificationData: undefined };
  render(view());
  expect(screen.getByRole('heading', { name: 'Specification practice unavailable' })).toBeVisible();
});
