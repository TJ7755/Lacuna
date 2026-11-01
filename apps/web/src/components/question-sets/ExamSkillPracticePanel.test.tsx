import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it } from 'vitest';
import { createCourse } from '../../db/courseRepository';
import { db } from '../../db/schema';
import { listExamSkillPractice } from '../../questions/examSkillPractice';
import { createQuestionSet } from '../../questions/questionSetRepository';
import { ExamSkillPracticePanel } from './ExamSkillPracticePanel';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('renders authored exam skills and starts their actual saved questions with explicit familiar fallback', async () => {
  const course = await createCourse('Biology');
  await createQuestionSet({
    id: 'set',
    courseId: course.id,
    title: 'ADH release',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'graph',
        prompt: 'Read the graph',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'mark',
              criterion: 'Read the trend',
              maxMarks: 1,
              dimension: 'application',
              targetConceptIds: [],
              techniqueTags: {
                taxonomyId: 'science-techniques',
                taxonomyVersion: 1,
                techniqueIds: ['graph-interpretation'],
                provenance: { source: 'author' },
              },
            },
          ],
        },
      },
    ],
  });
  const skills = await listExamSkillPractice(course.id);
  const view = () =>
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <ExamSkillPracticePanel courseId={course.id} skills={skills} disabled={false} />
            }
          />
          <Route
            path="/course/:courseId/question-sets/:setId/attempts/:attemptId"
            element={<p>Answer selected question</p>}
          />
        </Routes>
      </MemoryRouter>,
    );
  let mounted = view();
  expect(screen.getByRole('heading', { name: 'Exam-skill practice' })).toBeVisible();
  expect(screen.queryByText('ADH release')).not.toBeInTheDocument();
  expect(screen.queryByText(/skills due/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Practise Interpret a graph' }));
  await screen.findByText('Answer selected question');
  const [saved] = await db.questionSetAttempts.toArray();
  expect(saved.receipt.questions.map((question) => question.id)).toEqual(['graph']);
  expect(saved.conceptPractice).toBeUndefined();
  mounted.unmount();
  mounted = view();
  fireEvent.click(screen.getByRole('button', { name: 'Practise Interpret a graph' }));
  await screen.findByText(/No unseen questions remain/);
  expect(await db.questionSetAttempts.count()).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Practise familiar questions' }));
  await screen.findByText('Answer selected question');
  await waitFor(async () => expect(await db.questionSetAttempts.count()).toBe(2));
  mounted.unmount();
});

it('explains an untagged bank and disables starting practice', () => {
  render(
    <MemoryRouter>
      <ExamSkillPracticePanel courseId="course" skills={[]} disabled={false} />
    </MemoryRouter>,
  );
  expect(screen.getByText(/No exam skills are explicitly tagged/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Practise exam skills' })).toBeDisabled();
});
