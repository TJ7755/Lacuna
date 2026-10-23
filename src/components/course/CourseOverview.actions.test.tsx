import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse } from '../../db/courseRepository';
import { createLesson } from '../../db/lessonRepository';
import { createCourseAssessment } from '../../db/assessmentRepository';
import { createQuestionSet } from '../../questions/questionSetRepository';
import { createQuestionSetPracticeNode } from '../../db/practiceNodeRepository';
import { createPracticeNode } from '../../db/practiceNodeRepository';
import { db } from '../../db/schema';
import type { CourseAssessment } from '../../db/types';
import type { PathNode } from '../../course/path';
import { ToastProvider } from '../ui/Toast';
import { CourseOverview } from './CourseOverview';

function overview(nodes: PathNode[], authoring = true, assessments: CourseAssessment[] = []) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <CourseOverview
          courseId="course"
          nodes={nodes}
          lessonCount={2}
          assessments={assessments}
          authoring={authoring}
          archived={false}
          announcement=""
          detailForLesson={() => ({ cardCount: 0, dueCount: 0, masteryPct: 0 })}
          lockHint={() => undefined}
          reorderFor={vi.fn()}
          onLessonMove={vi.fn()}
          practiceProgress={new Map()}
          onLessonOpen={vi.fn()}
          onLessonCreated={vi.fn()}
          onPracticeOpen={vi.fn()}
          onPracticeEdit={vi.fn()}
          onAssessmentOpen={vi.fn()}
          onAssessmentPractise={vi.fn()}
          onAdd={vi.fn()}
        />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('course path node actions', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });
  afterEach(cleanup);

  it('deletes manual practice through its path menu only after confirmation', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const practice = await createPracticeNode(course.id, {
      type: 'manual',
      name: 'Card practice',
      position: lesson.orderIndex,
    });
    const nodes: PathNode[] = [
      { id: lesson.id, nodeType: 'lesson', lesson, status: 'available' },
      {
        id: practice.id,
        nodeType: 'practice-manual',
        practiceNode: practice,
        nodeKey: practice.id,
        afterLessonId: lesson.id,
      },
    ];
    const view = render(overview(nodes));
    expect(
      screen.getByRole('button', { name: 'Card practice: Card practice, 0% secured' }),
    ).toHaveAttribute('data-press', 'none');
    expect(screen.getByRole('button', { name: 'Cells' })).toHaveAttribute('data-press', '');
    fireEvent.click(screen.getByRole('button', { name: 'Practice actions: Card practice' }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    await waitFor(async () =>
      expect((await db.practiceNodes.get(practice.id))?.position).toBeUndefined(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Practice actions: Card practice' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete practice' }));
    expect(await db.practiceNodes.get(practice.id)).toBeDefined();
    const dialog = screen.getByRole('dialog', { name: 'Delete Card practice?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete practice' }));
    await waitFor(async () => expect(await db.practiceNodes.get(practice.id)).toBeUndefined());
    expect(await db.lessons.get(lesson.id)).toBeDefined();
    view.rerender(overview(nodes.filter((node) => node.id !== practice.id)));
    expect(
      screen.queryByRole('button', { name: 'Practice actions: Card practice' }),
    ).not.toBeInTheDocument();
    view.rerender(overview(nodes, false));
    expect(screen.queryByRole('button', { name: /actions:/ })).not.toBeInTheDocument();
  });
  it.each(['checkpoint', 'question-set'] as const)(
    'moves and deletes a %s through the path menu',
    async (kind) => {
      const course = await createCourse('Biology');
      const first = await createLesson(course.id, 'Cells');
      const second = await createLesson(course.id, 'Tissues');
      let node: PathNode;
      if (kind === 'checkpoint') {
        const assessment = await createCourseAssessment(
          course.id,
          'Paper 1',
          Date.now() + 86400000,
          { afterLessonId: first.id },
        );
        node = { id: assessment.id, nodeType: 'checkpoint', assessment, afterLessonId: first.id };
      } else {
        const set = await createQuestionSet({
          id: 'set',
          courseId: course.id,
          title: 'Cell questions',
          lessonIds: [],
          assessmentIds: [],
          questions: [
            {
              id: 'question',
              prompt: 'Describe a cell.',
              parts: [],
              answer: {
                maxMarks: 1,
                response: { kind: 'written' },
                prerequisiteConceptIds: [],
                allocations: [
                  {
                    id: 'allocation',
                    criterion: 'Describes a cell.',
                    maxMarks: 1,
                    dimension: 'knowledge',
                    targetConceptIds: [],
                  },
                ],
              },
            },
          ],
        });
        const practiceNode = await createQuestionSetPracticeNode(course.id, set.id, first.id);
        node = {
          id: practiceNode.id,
          nodeType: 'practice-question-set',
          practiceNode,
          questionSetIds: [set.id],
          nodeKey: practiceNode.id,
          afterLessonId: first.id,
        };
      }
      const nodes: PathNode[] = [
        { id: first.id, nodeType: 'lesson', lesson: first, status: 'available' },
        node,
        { id: second.id, nodeType: 'lesson', lesson: second, status: 'available' },
      ];
      const view = render(overview(nodes));
      const label =
        kind === 'checkpoint'
          ? 'Assessment actions: Paper 1'
          : 'Question set actions: Practice questions';
      fireEvent.click(screen.getByRole('button', { name: label }));
      if (kind === 'question-set')
        expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
      const read = () =>
        kind === 'checkpoint' ? db.courseAssessments.get(node.id) : db.practiceNodes.get(node.id);
      await waitFor(async () => expect((await read())?.afterLessonId).toBe(second.id));
      const deleteLabel = kind === 'checkpoint' ? 'Delete checkpoint' : 'Delete activity';
      fireEvent.click(screen.getByRole('button', { name: label }));
      fireEvent.click(screen.getByRole('menuitem', { name: deleteLabel }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      expect(await read()).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: label }));
      fireEvent.click(screen.getByRole('menuitem', { name: deleteLabel }));
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: deleteLabel }),
      );
      await waitFor(async () => expect(await read()).toBeUndefined());
      if (kind === 'question-set') expect(await db.questionSets.get('set')).toBeDefined();
      view.rerender(overview(nodes, false));
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    },
  );
  it('keeps the required final assessment editable without offering movement or deletion', async () => {
    const course = await createCourse('Biology');
    const assessments = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    const view = render(overview([], true, assessments));
    fireEvent.click(
      screen.getByRole('button', { name: `Assessment actions: ${assessments[0].name}` }),
    );
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Delete|Move/ })).not.toBeInTheDocument();
    view.rerender(overview([], false, assessments));
    expect(screen.queryByRole('button', { name: /actions:/ })).not.toBeInTheDocument();
  });
});
