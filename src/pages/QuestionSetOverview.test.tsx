import 'fake-indexeddb/auto';
import { domAnimation, LazyMotion } from 'motion/react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import { createQuestionSet } from '../questions/questionSetRepository';
import { startQuestionSetAttempt } from '../questions/questionSetAttemptRepository';
import { QuestionSetOverview } from './QuestionSetOverview';

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
}));

async function fixture() {
  const course = await createCourse('Biology');
  await db.courses.update(course.id, { lessonViewMode: 'edit' });
  const set = await createQuestionSet({
    id: 'cells',
    courseId: course.id,
    title: 'Cells',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'q1',
        prompt: '**Cell structure**',
        parts: ['a', 'b'].map((id) => ({
          id,
          prompt: `Describe part ${id}.`,
          subparts: [],
          answer: {
            maxMarks: 2,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: `point-${id}`,
                criterion: 'Structure',
                maxMarks: 2,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        })),
      },
    ],
  });
  return { course, set };
}
function open(courseId: string) {
  const router = createMemoryRouter(
    [
      { path: '/course/:courseId/question-sets/:setId', element: <QuestionSetOverview /> },
      {
        path: '/course/:courseId/question-sets/:setId/attempts/:attemptId',
        element: <p>Attempt opened</p>,
      },
    ],
    { initialEntries: [`/course/${courseId}/question-sets/cells`] },
  );
  return {
    ...render(
      <LazyMotion features={domAnimation}>
        <RouterProvider router={router} />
      </LazyMotion>,
    ),
    router,
  };
}
beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

describe('QuestionSetOverview', () => {
  it('shows questions and indented parts inline without empty attempts or modal triggers', async () => {
    const { course } = await fixture();
    open(course.id);
    const questions = await screen.findByRole('region', { name: 'Questions' });
    expect(within(questions).getAllByRole('listitem')).toHaveLength(3);
    expect(within(questions).getByText('Cell structure')).toBeVisible();
    expect(within(questions).getByText('Describe part a.')).toBeVisible();
    expect(within(questions).getByText('Describe part b.')).toBeVisible();
    expect(within(questions).getByText('4 marks')).toBeVisible();
    expect(within(questions).getAllByText('2 marks')).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Attempts' })).not.toBeInTheDocument();
    expect(screen.queryByText('Browse questions')).not.toBeInTheDocument();
    expect(screen.queryByText('Practice evidence')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toBeVisible();
  });

  it.each(['practice', 'paper'] as const)(
    'starts the chosen %s mode and preserves the feedback descriptions',
    async (mode) => {
      const { course } = await fixture();
      const { router } = open(course.id);
      const group = await screen.findByRole('group', { name: 'Attempt mode' });
      const practice = within(group).getByRole('button', { name: 'Practice' });
      const paper = within(group).getByRole('button', { name: 'Paper' });
      expect(practice).toHaveAccessibleDescription('Feedback after each question');
      expect(paper).toHaveAccessibleDescription('Feedback at the end');
      fireEvent.click(mode === 'paper' ? paper : practice);
      expect(mode === 'paper' ? paper : practice).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await screen.findByText('Attempt opened');
      const attempts = await db.questionSetAttempts.toArray();
      expect(attempts).toHaveLength(1);
      expect(attempts[0].mode).toBe(mode);
      expect(router.state.location.pathname).toContain(`/attempts/${attempts[0].id}`);
    },
  );

  it.each(['answering', 'marking'] as const)(
    'resumes the latest unfinished %s attempt without creating another',
    async (status) => {
      const { course, set } = await fixture();
      const older = await startQuestionSetAttempt(set.id, 'practice', 100);
      const latest = await startQuestionSetAttempt(set.id, 'paper', 200);
      await db.questionSetAttempts.update(
        latest.id,
        status === 'answering'
          ? { updatedAt: 300 }
          : {
              status,
              updatedAt: 300,
              paperSubmittedAt: 300,
              revealedQuestionIds: ['q1'],
              responses: latest.responses.map((response) => ({
                ...response,
                submitted: response.draft,
                submittedAt: 300,
              })),
            },
      );
      const complete = await startQuestionSetAttempt(set.id, 'practice', 400);
      await db.questionSetAttempts.update(complete.id, {
        status: 'complete',
        updatedAt: 500,
        completedAt: 500,
        revealedQuestionIds: ['q1'],
        responses: complete.responses.map((response) => ({
          ...response,
          submitted: response.draft,
          submittedAt: 500,
        })),
        decisions: ['a', 'b'].map((id) => ({
          allocationId: `point-${id}`,
          status: 'awarded' as const,
          marks: 2,
        })),
      });
      const { router } = open(course.id);
      const resume = await screen.findByRole('button', { name: 'Resume' });
      expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Attempt mode' })).not.toBeInTheDocument();
      expect(screen.getByText('Paper attempt · Feedback at the end')).toBeVisible();
      fireEvent.click(resume);
      await waitFor(() =>
        expect(router.state.location.pathname).toContain(`/attempts/${latest.id}`),
      );
      expect(await db.questionSetAttempts.count()).toBe(3);
      expect(router.state.location.pathname).not.toContain(older.id);
    },
  );

  it('shows completed scores and dimensions inside the Attempts card without a repeat filter', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'practice', 100);
    await db.questionSetAttempts.update(attempt.id, {
      status: 'complete',
      completedAt: 200,
      updatedAt: 200,
      revealedQuestionIds: ['q1'],
      responses: attempt.responses.map((response) => ({
        ...response,
        submitted: response.draft,
        submittedAt: 200,
      })),
      decisions: ['a', 'b'].map((id) => ({
        allocationId: `point-${id}`,
        status: 'awarded' as const,
        marks: 1,
      })),
    });
    open(course.id);
    const attempts = await screen.findByRole('region', { name: 'Attempts' });
    expect(within(attempts).getByText('1 Jan 1970')).toBeVisible();
    fireEvent.click(within(attempts).getByRole('button', { name: 'Evidence details' }));
    expect(within(attempts).getAllByText('2 / 4')).toHaveLength(2);
    expect(within(attempts).getByText('2 / 4 marks')).toBeVisible();
    await waitFor(() => expect(within(attempts).getByText('Knowledge')).toBeVisible());
    expect(within(attempts).getByRole('heading', { name: 'Recorded marks' })).toBeVisible();
    expect(
      within(attempts).queryByRole('group', { name: 'Evidence attempts' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  });

  it('keeps retained attempt links in the removed-set layout', async () => {
    const { course, set } = await fixture();
    const attempt = await startQuestionSetAttempt(set.id, 'paper');
    await db.questionSets.delete(set.id);
    const { router } = open(course.id);
    expect(await screen.findByRole('heading', { name: 'Cells', level: 1 })).toBeVisible();
    const attempts = screen.getByRole('region', { name: 'Attempts' });
    fireEvent.click(within(attempts).getByRole('link'));
    expect(await screen.findByText('Attempt opened')).toBeVisible();
    expect(router.state.location.pathname).toContain(`/attempts/${attempt.id}`);
    expect(screen.queryByRole('button', { name: /Start|Resume/ })).not.toBeInTheDocument();
  });

  it('keeps missing-set errors and read-only editing restrictions', async () => {
    const { course } = await fixture();
    await db.courses.update(course.id, { lessonViewMode: 'study' });
    const view = open(course.id);
    await screen.findByRole('heading', { name: 'Cells', level: 1 });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    view.unmount();
    await db.questionSets.clear();
    open(course.id);
    await screen.findByRole('heading', { name: 'Question set not found' });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Question set not found' })).toHaveFocus(),
    );
    expect(screen.getByRole('link', { name: 'Back to Questions' })).toBeVisible();
  });
});
