import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPath } from '../../course/path';
import { createCourse } from '../../db/courseRepository';
import { createLesson } from '../../db/lessonRepository';
import { createCourseAssessment } from '../../db/assessmentRepository';
import { createPracticeNode } from '../../db/practiceNodeRepository';
import { db } from '../../db/schema';
import type { Course, CourseAssessment, Lesson, PracticeNode } from '../../db/types';
import { CourseOverview } from './CourseOverview';
import { useCoursePathReorder } from './useCoursePathReorder';

const onLessonOpen = vi.fn();
const onError = vi.fn();

function Harness({
  course,
  lessons,
  assessments,
  practice,
}: {
  course: Course;
  lessons: Lesson[];
  assessments: CourseAssessment[];
  practice: PracticeNode[];
}) {
  const nodes = buildPath(course, lessons, assessments, new Map(), practice);
  const localOrder = !course.archived;
  const reorder = useCoursePathReorder(
    course.id,
    nodes,
    lessons,
    [],
    [],
    localOrder,
    onError,
    true,
  );
  return (
    <MemoryRouter>
      <CourseOverview
        courseId={course.id}
        nodes={nodes}
        lessonCount={lessons.length}
        assessments={assessments}
        authoring={false}
        localOrder={localOrder}
        archived={!!course.archived}
        announcement={reorder.announcement}
        detailForLesson={() => ({ cardCount: 0, dueCount: 0, masteryPct: 0 })}
        lockHint={() => 'Complete earlier work.'}
        reorderFor={reorder.interactionFor}
        onLessonMove={reorder.moveBy}
        practiceProgress={new Map()}
        onLessonOpen={onLessonOpen}
        onLessonCreated={vi.fn()}
        onPracticeOpen={vi.fn()}
        onPracticeEdit={vi.fn()}
        onAssessmentOpen={vi.fn()}
        onAssessmentPractise={vi.fn()}
        onAdd={vi.fn()}
      />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  vi.clearAllMocks();
});
afterEach(cleanup);

it.each(['semi-linear', 'linear'] as const)(
  'reorders unreached %s library lessons without editing published content or starting study',
  async (unlockMode) => {
    const course = await createCourse('Science', {
      unlockMode,
      autoPractice: false,
      linearCadence: { anchorDate: Date.now() + 86400000, intervalDays: 1 },
    });
    const a = await createLesson(course.id, 'A');
    const b = await createLesson(course.id, 'B');
    const c = await createLesson(course.id, 'C');
    const checkpoint = await createCourseAssessment(
      course.id,
      'Topic test',
      Date.now() + 86400000,
      { afterLessonId: c.id },
    );
    const practice = await createPracticeNode(course.id, {
      type: 'manual',
      name: 'Cards',
      position: c.orderIndex,
    });
    const local: Course = {
      ...course,
      distributedCopy: {
        lineageId: 'science',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
      localLessonOrder: [b.id, a.id, c.id],
    };
    await db.courses.update(course.id, {
      distributedCopy: local.distributedCopy,
      localLessonOrder: local.localLessonOrder,
    });
    const lessons = [a, b, c];
    const assessments = await db.courseAssessments.toArray();
    const storedLessons = await db.lessons.toArray();
    const storedPractice = await db.practiceNodes.toArray();
    const props = { course: local, lessons, assessments, practice: [practice] };
    const view = render(<Harness {...props} />);
    const row = screen.getByRole('button', { name: 'C, locked for study' });
    expect(row).not.toBeDisabled();
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
    fireEvent.click(row);
    expect(onLessonOpen).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', {
        name: /Lesson actions|Practice actions|Assessment actions|Add to course/,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open checkpoint: Topic test' })).not.toHaveAttribute(
      'aria-keyshortcuts',
    );
    expect(
      screen.getByRole('button', { name: 'Card practice: Cards, 0% secured' }),
    ).not.toHaveAttribute('aria-keyshortcuts');
    fireEvent.keyDown(row, { altKey: true, key: 'ArrowUp' });
    await waitFor(async () =>
      expect((await db.courses.get(course.id))?.localLessonOrder).toEqual([b.id, c.id, a.id]),
    );
    view.rerender(
      <Harness {...props} course={{ ...local, localLessonOrder: [b.id, c.id, a.id] }} />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'C, locked for study' }), {
      altKey: true,
      key: 'ArrowUp',
    });
    await waitFor(async () =>
      expect((await db.courses.get(course.id))?.localLessonOrder).toEqual([c.id, b.id, a.id]),
    );
    expect(await db.lessons.toArray()).toEqual(storedLessons);
    expect(await db.practiceNodes.toArray()).toEqual(storedPractice);
    expect(await db.courseAssessments.get(checkpoint.id)).toEqual(checkpoint);
    expect(onError).not.toHaveBeenCalled();

    view.rerender(<Harness {...props} course={{ ...local, archived: true }} />);
    expect(screen.getByRole('button', { name: 'C' })).not.toHaveAttribute('aria-keyshortcuts');
  },
);
