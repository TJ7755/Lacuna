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
  await createLesson(course.id, 'Tissues');
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
  return { course, firstLesson, set };
}

function activity(
  courseId: string,
  questionSetId: string,
  afterLessonId: string,
): QuestionSetPracticeNode {
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
    vi.mocked(createQuestionSetPracticeNode)
      .mockReset()
      .mockResolvedValue({} as QuestionSetPracticeNode);
    vi.mocked(updateQuestionSetPracticeNode)
      .mockReset()
      .mockResolvedValue({} as QuestionSetPracticeNode);
    vi.mocked(deleteQuestionSetPracticeNode).mockReset().mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('creates an activity from a saved set at the selected lesson anchor', async () => {
    const { course, firstLesson, set } = await fixture();
    const onClose = vi.fn();
    render(
      <QuestionSetPathEditor
        courseId={course.id}
        afterLessonId={firstLesson.id}
        onClose={onClose}
      />,
    );

    expect(
      await screen.findByRole('dialog', { name: 'Add practice questions' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a question set' }));
    await screen.findByRole('radio', { name: 'Cell structure' });
    fireEvent.click(screen.getByRole('radio', { name: 'Cell structure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() =>
      expect(createQuestionSetPracticeNode).toHaveBeenCalledWith(course.id, set.id, firstLesson.id),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(updateQuestionSetPracticeNode).not.toHaveBeenCalled();
    expect(deleteQuestionSetPracticeNode).not.toHaveBeenCalled();
  });

  it('submits on Ctrl+Enter from a choice once the form is complete', async () => {
    const { course, firstLesson, set } = await fixture();
    const onClose = vi.fn();
    render(
      <QuestionSetPathEditor
        courseId={course.id}
        afterLessonId={firstLesson.id}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a question set' }));
    const choice = await screen.findByRole('radio', { name: 'Cell structure' });
    fireEvent.keyDown(choice, { key: 'Enter', ctrlKey: true });
    expect(createQuestionSetPracticeNode).not.toHaveBeenCalled();
    await screen.findByText('Choose a question set.');
    fireEvent.click(choice);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cell structure' }), {
      key: 'Enter',
      ctrlKey: true,
    });
    await waitFor(() =>
      expect(createQuestionSetPracticeNode).toHaveBeenCalledWith(course.id, set.id, firstLesson.id),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('keeps the set and anchor when deletion is cancelled and Done saves', async () => {
    const { course, firstLesson, set } = await fixture();
    const node = activity(course.id, set.id, firstLesson.id);
    const onClose = vi.fn();
    render(<QuestionSetPathEditor courseId={course.id} node={node} onClose={onClose} />);
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Question set' })).toHaveValue('Cell structure'),
    );
    expect(screen.getByRole('textbox', { name: 'Question set' })).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Delete' }), { key: 'Escape' });
    expect(deleteQuestionSetPracticeNode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(updateQuestionSetPracticeNode).toHaveBeenCalledWith(node.id, firstLesson.id),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('keeps a selected draft open if its question set disappears and saving fails', async () => {
    const { course, firstLesson, set } = await fixture();
    const onClose = vi.fn();
    render(
      <QuestionSetPathEditor
        courseId={course.id}
        afterLessonId={firstLesson.id}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a question set' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Cell structure' }));
    await db.questionSets.delete(set.id);
    await screen.findByText('Save a question set before adding it to the path.');
    vi.mocked(createQuestionSetPracticeNode).mockRejectedValueOnce(
      new Error('Question set no longer exists.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByText('Question set no longer exists.');
    expect(createQuestionSetPracticeNode).toHaveBeenCalledWith(course.id, set.id, firstLesson.id);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('can leave an empty question-set entry point when there are no saved sets to choose', async () => {
    const course = await createCourse('Empty question pool');
    const lesson = await createLesson(course.id, 'First lesson');
    const onClose = vi.fn();
    render(
      <QuestionSetPathEditor courseId={course.id} afterLessonId={lesson.id} onClose={onClose} />,
    );
    await screen.findByText('Save a question set before adding it to the path.');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(createQuestionSetPracticeNode).not.toHaveBeenCalled();
  });
});
