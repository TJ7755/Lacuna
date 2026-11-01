import 'fake-indexeddb/auto';
import {
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
import { domAnimation, LazyMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));

function render(children: ReactNode) {
  return renderView(<LazyMotion features={domAnimation}>{children}</LazyMotion>);
}

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
    questionSetIds: [questionSetId],
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

  it('focuses content search and cancels a pending choice without changing the activity', async () => {
    const { course, firstLesson } = await fixture();
    render(
      <QuestionSetPathEditor
        courseId={course.id}
        afterLessonId={firstLesson.id}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a question set' }));
    const search = await screen.findByRole('searchbox', { name: 'Search question sets' });
    await waitFor(() => expect(search).toHaveFocus());
    fireEvent.change(search, { target: { value: 'describe a cell' } });
    const choice = await screen.findByRole('radio', { name: /Cell structure/ });
    expect(screen.getByText(/Question 1: Describe a cell/)).toBeInTheDocument();
    expect(screen.getByText(/1 question · 1 answerable part · 1 mark/)).toBeInTheDocument();
    fireEvent.click(choice);
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Choose a question set' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.getByRole('button', { name: 'Choose a question set' })).toHaveFocus();
    expect(createQuestionSetPracticeNode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Choose a question set.')).toBeInTheDocument();
  });

  it.each(['Cancel', 'Escape', 'backdrop'] as const)(
    'abandons an empty activity with %s before and after validation fails',
    async (action) => {
      const { course, firstLesson } = await fixture();
      function Harness() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button onClick={() => setOpen(true)}>Add practice</button>
            {open && (
              <QuestionSetPathEditor
                courseId={course.id}
                afterLessonId={firstLesson.id}
                onClose={() => setOpen(false)}
              />
            )}
          </>
        );
      }
      render(<Harness />);
      const opener = screen.getByRole('button', { name: 'Add practice' });
      for (const validate of [false, true]) {
        opener.focus();
        fireEvent.click(opener);
        fireEvent.click(screen.getByRole('button', { name: 'Choose a question set' }));
        const search = await screen.findByRole('searchbox');
        await screen.findByRole('radio', { name: /Cell structure/ });
        fireEvent.keyDown(search, { key: 'Escape' });
        expect(screen.getByRole('dialog', { name: 'Add practice questions' })).toBeVisible();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        if (validate) {
          fireEvent.click(screen.getByRole('button', { name: 'Done' }));
          await screen.findByText('Choose a question set.');
        }
        if (action === 'Cancel') {
          fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        } else if (action === 'Escape') {
          fireEvent.keyDown(screen.getByRole('button', { name: 'Choose a question set' }), {
            key: 'Escape',
          });
        } else {
          fireEvent.click(document.querySelector('[data-path-editor-backdrop]')!);
        }
        await waitFor(() =>
          expect(screen.queryAllByRole('dialog', { hidden: true })).toHaveLength(0),
        );
        expect(opener).toHaveFocus();
        expect(opener.closest('[inert]')).toBeNull();
        expect(createQuestionSetPracticeNode).not.toHaveBeenCalled();
        expect(updateQuestionSetPracticeNode).not.toHaveBeenCalled();
        expect(deleteQuestionSetPracticeNode).not.toHaveBeenCalled();
      }
    },
  );

  it('discards a confirmed set choice when the parent editor is cancelled', async () => {
    const { course, firstLesson } = await fixture();
    const onClose = vi.fn();
    render(
      <QuestionSetPathEditor
        courseId={course.id}
        afterLessonId={firstLesson.id}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a question set' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Cell structure/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use question set' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(createQuestionSetPracticeNode).not.toHaveBeenCalled();
  });

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
    await screen.findByRole('radio', { name: /Cell structure/ });
    fireEvent.click(screen.getByRole('radio', { name: /Cell structure/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use question set' }));
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
    const choice = await screen.findByRole('radio', { name: /Cell structure/ });
    fireEvent.keyDown(choice, { key: 'Enter', ctrlKey: true });
    expect(createQuestionSetPracticeNode).not.toHaveBeenCalled();
    expect(screen.getByRole('searchbox', { name: 'Search question sets' })).toBeInTheDocument();
    fireEvent.click(choice);
    fireEvent.click(screen.getByRole('button', { name: 'Use question set' }));
    fireEvent.keyDown(screen.getByRole('button', { name: /Cell structure/ }), {
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
      expect(screen.getByRole('button', { name: 'Cell structure' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Delete' }), { key: 'Escape' });
    expect(deleteQuestionSetPracticeNode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(updateQuestionSetPracticeNode).toHaveBeenCalledWith(
        node.id,
        firstLesson.id,
        set.id,
        node.updatedAt,
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('keeps the opening revision when live props change beneath a pending selection', async () => {
    const { course, firstLesson, set } = await fixture();
    const replacement = await createQuestionSet({ ...set, id: 'set-2' });
    const node = activity(course.id, set.id, firstLesson.id);
    const onClose = vi.fn();
    const { rerender } = render(
      <QuestionSetPathEditor courseId={course.id} node={node} onClose={onClose} />,
    );
    await screen.findByRole('button', { name: 'Cell structure' });
    rerender(
      <LazyMotion features={domAnimation}>
        <QuestionSetPathEditor
          courseId={course.id}
          node={{ ...node, questionSetIds: [replacement.id], updatedAt: 2 }}
          onClose={onClose}
        />
      </LazyMotion>,
    );
    vi.mocked(updateQuestionSetPracticeNode).mockRejectedValueOnce(
      new Error('Reopen this activity.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('alert');
    expect(updateQuestionSetPracticeNode).toHaveBeenCalledWith(node.id, firstLesson.id, set.id, 1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('replaces an existing set by identity despite duplicate titles and keeps the lesson anchor', async () => {
    const { course, firstLesson, set } = await fixture();
    const replacement = await createQuestionSet({ ...set, id: 'set-2' });
    const node = activity(course.id, set.id, firstLesson.id);
    const onClose = vi.fn();
    render(<QuestionSetPathEditor courseId={course.id} node={node} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cell structure' }));
    const choices = await screen.findAllByRole('radio', { name: /Cell structure/ });
    expect(choices[0]).toBeChecked();
    fireEvent.click(choices[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Use question set' }));
    expect(updateQuestionSetPracticeNode).not.toHaveBeenCalled();
    vi.mocked(updateQuestionSetPracticeNode).mockRejectedValueOnce(
      new Error('The Question Set must belong to this Course.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('alert');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cell structure' }));
    expect((await screen.findAllByRole('radio', { name: /Cell structure/ }))[1]).toBeChecked();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Choose a question set' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(updateQuestionSetPracticeNode).toHaveBeenLastCalledWith(
      node.id,
      firstLesson.id,
      replacement.id,
      node.updatedAt,
    );
    expect(createQuestionSetPracticeNode).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'cancels replacement without saving (confirmed choice: %s)',
    async (confirm) => {
      const { course, firstLesson, set } = await fixture();
      await createQuestionSet({ ...set, id: 'set-2', title: 'Replacement' });
      const node = activity(course.id, set.id, firstLesson.id);
      const onClose = vi.fn();
      render(<QuestionSetPathEditor courseId={course.id} node={node} onClose={onClose} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Cell structure' }));
      fireEvent.click(await screen.findByRole('radio', { name: /Replacement/ }));
      if (confirm) {
        fireEvent.click(screen.getByRole('button', { name: 'Use question set' }));
      } else {
        fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
        expect(screen.getByRole('button', { name: 'Cell structure' })).toHaveFocus();
      }
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
      expect(updateQuestionSetPracticeNode).not.toHaveBeenCalled();
    },
  );

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
    fireEvent.click(await screen.findByRole('radio', { name: /Cell structure/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use question set' }));
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
