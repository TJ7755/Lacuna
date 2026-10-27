import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPath } from '../../course/path';
import { createCourse } from '../../db/courseRepository';
import { importLineageFirstTime } from '../../db/mergeImport';
import { createLesson } from '../../db/lessonRepository';
import { createCourseAssessment } from '../../db/assessmentRepository';
import { createPracticeNode } from '../../db/practiceNodeRepository';
import { db } from '../../db/schema';
import type { Course, CourseAssessment, Lesson, PracticeNode } from '../../db/types';
import { CourseOverview } from './CourseOverview';
import { ToastProvider } from '../ui/Toast';
import { useCoursePathReorder } from './useCoursePathReorder';
import { pathMoveOrder } from './pathNodeReorder';
import { setCoursePaperAssessments } from '../../db/paperAssessmentRepository';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../../specifications/paperFixture.testFixtures';

const onLessonOpen = vi.fn();
const onError = vi.fn();
const onAssessmentOpen = vi.fn();
const onAdd = vi.fn();

function Harness({
  course,
  lessons,
  assessments,
  practice,
  learnerCheckpointIds = [],
}: {
  course: Course;
  lessons: Lesson[];
  assessments: CourseAssessment[];
  practice: PracticeNode[];
  learnerCheckpointIds?: readonly string[];
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
    learnerCheckpointIds,
  );
  return (
    <MemoryRouter>
      <ToastProvider>
        <CourseOverview
          courseId={course.id}
          nodes={nodes}
          lessonCount={lessons.length}
          assessments={assessments}
          authoring={false}
          localOrder={localOrder}
          learnerCheckpointIds={learnerCheckpointIds}
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
          onAssessmentOpen={onAssessmentOpen}
          onAssessmentPractise={vi.fn()}
          onAdd={onAdd}
        />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  vi.clearAllMocks();
});
afterEach(cleanup);

it('keeps paper coverage valid when an author changes lesson order', async () => {
  const course = await createCourse('Science', {
    specificationData: paperSpecification,
    specificationRef: paperSpecificationReference,
  });
  const a = await createLesson(course.id, 'A');
  const b = await createLesson(course.id, 'B');
  await setCoursePaperAssessments(course.id, [
    { paperId: 'paper-1', examDate: Date.now() + 86400000 },
    { paperId: 'paper-2', examDate: Date.now() + 172800000 },
  ]);
  const assessments = await db.courseAssessments.toArray();
  const nodes = buildPath(course, [a, b], assessments, new Map(), []);
  const order = pathMoveOrder(
    nodes,
    a.id,
    nodes.findIndex((node) => node.id === b.id) + 1,
    [],
    [],
    { course, concepts: [] },
  );
  expect(order?.filter((id) => id === a.id || id === b.id)).toEqual([b.id, a.id]);
  expect(await db.courseAssessments.toArray()).toEqual(assessments);
});

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

it('moves and manages only learner checkpoints on a locked path using local lesson anchors', async () => {
  const { course } = await importLineageFirstTime({
    v: 5,
    by: 'Teacher',
    at: 1000,
    li: 'science',
    rv: 1,
    course: { n: 'Science', o: 0, c: 1000, sm: 1, um: 'open' },
    lessons: ['A', 'B', 'C'].map((id) => ({ i: id, n: id, notes: [], cards: [] })),
    exams: [
      { id: 'final', n: 'Final', k: 'f', a: null, m: 'p', sm: 1, c: 1000 },
      {
        id: 'published',
        n: 'Published test',
        k: 'c',
        a: 2,
        m: 'p',
        e: Date.now() + 172800000,
        c: 1000,
      },
    ],
    concepts: [],
    questions: [],
    questionSets: [],
    questionSetPracticeNodes: [],
  });
  const a = (await db.lessons.get('A'))!;
  const b = (await db.lessons.get('B'))!;
  const c = (await db.lessons.get('C'))!;
  const owned = await createCourseAssessment(course.id, 'My test', Date.now() + 86400000, {
    afterLessonId: a.id,
  });
  const second = await createCourseAssessment(course.id, 'Later test', Date.now() + 259200000, {
    afterLessonId: a.id,
  });
  const published = (await db.courseAssessments.get('published'))!;
  await db.courses.update(course.id, { autoPractice: false, localLessonOrder: [c.id, a.id, b.id] });
  const local = { ...course, autoPractice: false, localLessonOrder: [c.id, a.id, b.id] };
  const assessments = await db.courseAssessments.toArray();
  const props = {
    course: local,
    lessons: [a, b, c],
    assessments,
    practice: [],
    learnerCheckpointIds: [owned.id, second.id],
  };
  const view = render(<Harness {...props} />);
  const path = screen.getByRole('list', { name: 'Course path' });
  const row = within(path).getByRole('button', { name: 'Edit checkpoint: My test' });
  expect(row).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
  expect(
    within(path).getByRole('button', { name: 'Open checkpoint: Published test' }),
  ).not.toHaveAttribute('aria-keyshortcuts');
  expect(
    screen.queryByRole('button', { name: 'Assessment actions: Published test' }),
  ).not.toBeInTheDocument();
  fireEvent.click(row);
  expect(onAssessmentOpen).toHaveBeenCalledWith(owned.id);
  fireEvent.keyDown(row, { altKey: true, key: 'ArrowUp' });
  await waitFor(async () =>
    expect((await db.courseAssessments.get(owned.id))?.afterLessonId).toBe(c.id),
  );
  view.rerender(<Harness {...props} assessments={await db.courseAssessments.toArray()} />);
  fireEvent.keyDown(within(path).getByRole('button', { name: 'Edit checkpoint: My test' }), {
    altKey: true,
    key: 'ArrowDown',
  });
  await waitFor(async () =>
    expect((await db.courseAssessments.get(owned.id))?.afterLessonId).toBe(a.id),
  );
  expect((await db.courses.get(course.id))?.localLessonOrder).toEqual([c.id, a.id, b.id]);
  view.rerender(<Harness {...props} assessments={await db.courseAssessments.toArray()} />);
  fireEvent.keyDown(within(path).getByRole('button', { name: 'A' }), {
    altKey: true,
    key: 'ArrowDown',
  });
  await waitFor(async () =>
    expect((await db.courses.get(course.id))?.localLessonOrder).toEqual([c.id, b.id, a.id]),
  );
  expect((await db.courseAssessments.get(owned.id))?.afterLessonId).toBe(a.id);
  expect(await db.courseAssessments.get(second.id)).toEqual(second);
  expect(await db.courseAssessments.get(published.id)).toEqual(published);
  expect(await db.lessons.toArray()).toEqual(
    [a, b, c].sort((left, right) => left.id.localeCompare(right.id)),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  fireEvent.click(screen.getByRole('menuitem', { name: /Checkpoint/ }));
  expect(onAdd).toHaveBeenCalledWith('checkpoint');
  fireEvent.click(within(path).getByRole('button', { name: 'Assessment actions: My test' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete checkpoint' }));
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Delete My test?' })).getByRole('button', {
      name: 'Delete checkpoint',
    }),
  );
  await waitFor(async () => expect(await db.courseAssessments.get(owned.id)).toBeUndefined());
  expect(await db.courseAssessments.get(published.id)).toEqual(published);
  expect(onError).not.toHaveBeenCalled();
});
