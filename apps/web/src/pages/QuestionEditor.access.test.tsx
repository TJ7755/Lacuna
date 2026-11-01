import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { QuestionConceptSet, QuestionDefinition } from '@lacuna/core/questions/types';
import { mocks, renderEditor } from './QuestionEditor.testSupport';

describe('QuestionEditor access', () => {
  it('offers a working route back when the requested Question no longer exists', async () => {
    const router = renderEditor('/course/course-1/questions/missing');
    expect(
      await screen.findByRole('heading', { name: 'This Question could not be found.' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Questions' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/course/course-1/questions'));
  });

  it.each(['fixed', 'generated'] as const)(
    'blocks creating %s Questions in a locked copy',
    async (kind) => {
      mocks.locked = true;
      renderEditor();
      await screen.findByRole('heading', { name: 'Create a Question' });
      if (kind === 'generated')
        fireEvent.click(screen.getByRole('button', { name: 'Generated family' }));
      fireEvent.change(screen.getByPlaceholderText('Completing the square'), {
        target: { value: 'Changed definition' },
      });
      if (kind === 'fixed') {
        fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'What is 2 + 2?' } });
        fireEvent.change(screen.getByLabelText('Expected answer'), { target: { value: '4' } });
        fireEvent.change(screen.getByLabelText('Worked explanation'), {
          target: { value: 'Combine the pairs.' },
        });
      }
      const save = screen.getByRole('button', { name: 'Create Question' });
      expect(save).toBeDisabled();
      fireEvent.click(save);
      expect(mocks.createFixed).not.toHaveBeenCalled();
      expect(mocks.createGenerated).not.toHaveBeenCalled();
    },
  );

  it('blocks adding Concepts from a locked Question editor', async () => {
    mocks.locked = true;
    renderEditor();
    fireEvent.change(await screen.findByPlaceholderText('A single piece of knowledge'), {
      target: { value: 'Published skill' },
    });
    const add = screen.getByRole('button', { name: /^Add$/ });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(mocks.createConcept).not.toHaveBeenCalled();
  });

  it('blocks editing or deleting a locked Question definition', async () => {
    mocks.locked = true;
    mocks.record = {
      question: {
        id: 'question-1',
        courseId: 'course-1',
        kind: 'fixed',
        name: 'Apply addition',
        prompt: 'What is 2 + 2?',
        payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
        explanation: 'Combine the pairs.',
        primaryLessonId: null,
        tags: [],
        suspended: false,
      } as unknown as QuestionDefinition,
      conceptSet: {
        questionId: 'question-1',
        courseId: 'course-1',
        targetConceptIds: ['concept-1'],
        prerequisiteConceptIds: [],
      } as unknown as QuestionConceptSet,
    };
    renderEditor('/course/course-1/questions/question-1');
    const save = await screen.findByRole('button', { name: 'Save Question' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mocks.updateFixed).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  describe('deleting a stored Question', () => {
    const openEditor = () => {
      mocks.record = {
        question: {
          id: 'question-1',
          courseId: 'course-1',
          kind: 'fixed',
          name: 'Apply addition',
          prompt: 'What is 2 + 2?',
          payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
          explanation: 'Combine the pairs.',
          primaryLessonId: null,
          tags: [],
          suspended: false,
        } as unknown as QuestionDefinition,
        conceptSet: {
          questionId: 'question-1',
          courseId: 'course-1',
          targetConceptIds: ['concept-1'],
          prerequisiteConceptIds: [],
        } as unknown as QuestionConceptSet,
      };
      renderEditor('/course/course-1/questions/question-1');
    };
    const copy = 'Delete this Question definition? Its attempt evidence will be retained.';

    it('saves suspension from the standard switch with the Question draft', async () => {
      openEditor();
      const control = await screen.findByRole('switch', { name: 'Suspend this Question' });
      expect(control).not.toBeChecked();
      fireEvent.click(control);
      fireEvent.click(screen.getByRole('button', { name: 'Save Question' }));
      await waitFor(() =>
        expect(mocks.updateFixed).toHaveBeenCalledWith(
          'question-1',
          expect.objectContaining({ suspended: true }),
        ),
      );
    });

    it('asks inline and leaves the definition intact on Cancel', async () => {
      openEditor();
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

      expect(await screen.findByText(copy)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(mocks.deleteQuestion).not.toHaveBeenCalled();
    });

    it('deletes the definition once confirmed', async () => {
      openEditor();
      mocks.deleteQuestion.mockResolvedValue(undefined);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      await screen.findByText(copy);
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(mocks.deleteQuestion).toHaveBeenCalledWith('question-1'));
      expect(await screen.findByText('Questions list')).toBeInTheDocument();
    });
  });
});
