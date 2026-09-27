import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse } from '../../db/repository';
import { createLesson } from '../../db/lessonRepository';
import type { QuestionSetPracticeNode } from '../../db/types';
import { db } from '../../db/schema';
import { createQuestionSet } from '../../questions/questionSetRepository';
import type { QuestionSet } from '../../questions/questionSets';
import {
  createQuestionSetPracticeNode,
  deleteQuestionSetPracticeNode,
  updateQuestionSetPracticeNode,
} from '../../db/practiceNodeRepository';
import { QuestionSetPathEditor } from './QuestionSetPathEditor';

vi.mock('../../db/practiceNodeRepository', () => ({
  createQuestionSetPracticeNode: vi.fn(),
  updateQuestionSetPracticeNode: vi.fn(),
  deleteQuestionSetPracticeNode: vi.fn(),
}));

async function fixture() {
  const course = await createCourse('Biology');
  const firstLesson = await createLesson(course.id, 'Cells');
  const secondLesson = await createLesson(course.id, 'Tissues');
  const content: QuestionSet = {
    id: 'set-1',
    courseId: course.id,
    title: 'Cell structure',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'question-1',
        prompt: 'Describe a cell.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'allocation-1',
              criterion: 'Describes a cell.',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: [],
            },
          ],
        },
      },
    ],
  };
  const set = await createQuestionSet(content, 100);
  return { course, firstLesson, secondLesson, set };
}

function activity(courseId: string, questionSetId: string, afterLessonId: string): QuestionSetPracticeNode {
  return {
    id: 'activity-1',
    courseId,
    type: 'question-set',
    name: 'Practice Qs',
    questionSetId,
    afterLessonId,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('QuestionSetPathEditor', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    vi.mocked(createQuestionSetPracticeNode).mockReset().mockResolvedValue({} as QuestionSetPracticeNode);
    vi.mocked(updateQuestionSetPracticeNode).mockReset().mockResolvedValue({} as QuestionSetPracticeNode);
    vi.mocked(deleteQuestionSetPracticeNode).mockReset().mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('creates an activity from a saved set at the selected lesson anchor', async () => {
    const { course, firstLesson, secondLesson, set } = await fixture();
    const onClose = vi.fn();
    render(
      <QuestionSetPathEditor
        courseId={course.id}
        afterLessonId={firstLesson.id}
        onClose={onClose}
      />,
    );

    expect(await screen.findByRole('dialog', { name: 'Add Practice Qs' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Cell structure' });
    fireEvent.change(screen.getByLabelText('Question set'), { target: { value: set.id } });
    fireEvent.change(screen.getByLabelText('After lesson'), { target: { value: secondLesson.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to path' }));

    await waitFor(() =>
      expect(createQuestionSetPracticeNode).toHaveBeenCalledWith(
        course.id,
        set.id,
        secondLesson.id,
      ),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(updateQuestionSetPracticeNode).not.toHaveBeenCalled();
    expect(deleteQuestionSetPracticeNode).not.toHaveBeenCalled();
  });

  it('keeps the set when removal is cancelled and saves edits to the lesson anchor', async () => {
    const { course, firstLesson, secondLesson, set } = await fixture();
    const node = activity(course.id, set.id, firstLesson.id);
    const onClose = vi.fn();
    render(<QuestionSetPathEditor courseId={course.id} node={node} onClose={onClose} />);

    expect(await screen.findByRole('dialog', { name: 'Edit Practice Qs' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Cell structure' });
    const setSelect = screen.getByLabelText('Question set');
    expect(setSelect).toHaveValue(set.id);
    expect(setSelect).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove activity' }));
    expect(
      screen.getByText('Remove this activity? The question set and attempts will remain.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(setSelect).toHaveValue(set.id);
    expect(deleteQuestionSetPracticeNode).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('After lesson'), { target: { value: secondLesson.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateQuestionSetPracticeNode).toHaveBeenCalledWith(node.id, secondLesson.id),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(deleteQuestionSetPracticeNode).not.toHaveBeenCalled();
  });
});
