import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../../db/schema';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  upsertLessonCardExposure,
} from '../../db/repository';
import { RevisionPlanSetup } from './RevisionPlanSetup';

async function reset() {
  await Promise.all([
    db.revisionPlans.clear(),
    db.courseAssessments.clear(),
    db.lessonCardExposures.clear(),
    db.lessonCompletions.clear(),
    db.lessonCards.clear(),
    db.cards.clear(),
    db.lessons.clear(),
    db.courses.clear(),
    db.decks.clear(),
  ]);
}

async function fixture() {
  const course = await createCourse('Biology');
  const lesson = await createLesson(course.id, 'Cells');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  await upsertLessonCardExposure(lesson.id, card.id);
  return createCourseAssessment(course.id, 'Paper 1', Date.now() + 3 * 86_400_000, {
    timeZone: 'UTC',
    afterLessonId: lesson.id,
    coverageMode: 'prefix',
  });
}

describe('RevisionPlanSetup', () => {
  beforeEach(reset);

  it('creates, leaves and reopens one explicit plan with future-day editing secondary', async () => {
    const assessment = await fixture();
    const onStart = vi.fn();
    const view = render(
      <RevisionPlanSetup assessmentId={assessment.id} onStart={onStart} onExit={vi.fn()} />,
    );

    expect(await screen.findByRole('heading', { name: 'Paper 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '10 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());

    const [planId, windowId] = onStart.mock.calls[0];
    const created = await db.revisionPlans.get(planId);
    expect(created?.assessmentId).toBe(assessment.id);
    expect(created?.windows.every((window) => window.budgetMinutes === 10)).toBe(true);
    expect(created?.windows.some((window) => window.id === windowId)).toBe(true);

    view.unmount();
    render(<RevisionPlanSetup assessmentId={assessment.id} onStart={onStart} onExit={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Start today’s window' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^\d{4}-\d{2}-\d{2} minutes$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit future days' }));
    const futureBudget = await screen.findAllByLabelText(/^\d{4}-\d{2}-\d{2} minutes$/);
    fireEvent.change(futureBudget[0], { target: { value: '35' } });
    fireEvent.blur(futureBudget[0]);
    await waitFor(async () => {
      const updated = await db.revisionPlans.get(planId);
      expect(
        updated?.windows.find((window) => window.day !== created?.windows[0].day)?.budgetMinutes,
      ).toBe(35);
    });
  });
});
