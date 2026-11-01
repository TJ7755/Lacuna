import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createCourse } from '../../db/courseRepository';
import { db } from '../../db/schema';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import { QuestionSetPicker } from './QuestionSetPicker';

vi.mock('../../state/motionSpeed', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  speedMultiplier: () => 0,
}));

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

it.each([
  ['author', 'edit', false, false, true],
  ['study', 'study', false, false, false],
  ['locked edit setting', 'edit', true, false, false],
  ['archived edit setting', 'edit', false, true, false],
] as const)(
  'gates answer-only picker search for %s',
  async (_name, mode, locked, archived, allowed) => {
    const course = await createCourse('Biology');
    await db.courses.update(course.id, {
      lessonViewMode: mode,
      archived,
      ...(locked
        ? {
            distributedCopy: {
              lineageId: 'biology',
              revision: 1,
              locked: true,
              autoAcceptUpdates: false,
            },
          }
        : {}),
    });
    const set: QuestionSet = {
      id: 'set',
      courseId: course.id,
      title: 'Cell paper',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        {
          id: 'q1',
          prompt: 'Explain diffusion.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'mark',
                criterion: 'Selective permeability',
                explanation: 'Water potential gradient',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    };
    const onChange = vi.fn();
    render(
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: '/course/:courseId',
              element: (
                <QuestionSetPicker
                  sets={[set]}
                  context={{}}
                  courseName="Biology"
                  value=""
                  onChange={onChange}
                  onClose={vi.fn()}
                  host={document.body}
                />
              ),
            },
          ],
          { initialEntries: [`/course/${course.id}`] },
        )}
      />,
    );
    const search = await screen.findByRole('searchbox', { name: 'Search question sets' });
    for (const [query, label] of [
      ['selective', 'Mark scheme: Question 1 criterion: Selective permeability'],
      ['water potential', 'Mark scheme: Question 1 explanation: Water potential gradient'],
    ]) {
      fireEvent.change(search, { target: { value: query } });
      if (allowed) {
        expect(await screen.findByRole('radio', { name: /Cell paper/ })).toBeVisible();
        expect(screen.getByText(label)).toBeVisible();
      } else {
        expect(await screen.findByText(/No matching sets/)).toBeVisible();
        expect(screen.queryByRole('radio', { name: /Cell paper/ })).not.toBeInTheDocument();
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
    }
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(search, { target: { value: 'diffusion' } });
    expect(await screen.findByRole('radio', { name: /Cell paper/ })).toBeVisible();
    expect(screen.getByText('Question 1: Explain diffusion.')).toBeVisible();
    expect(
      screen.queryByText(/Selective permeability|Water potential gradient/),
    ).not.toBeInTheDocument();
    if (allowed) {
      fireEvent.change(search, { target: { value: 'selective' } });
      await screen.findByText('Mark scheme: Question 1 criterion: Selective permeability');
      await db.courses.update(course.id, { lessonViewMode: 'study' });
      await waitFor(() =>
        expect(screen.queryByText(/Selective permeability/)).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole('radio', { name: /Cell paper/ })).not.toBeInTheDocument();
    }
  },
);
