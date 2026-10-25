import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { loadDraft } from '../utils/drafts';
import { chooseConcept, mocks, renderEditor } from './QuestionEditor.testSupport';
import { questionDraftKey } from './questionDraft';

describe('QuestionEditor', () => {
  it('uses the task title without repeating it in a decorative eyebrow', async () => {
    renderEditor();

    expect(await screen.findByRole('heading', { name: 'Create a Question' })).toBeInTheDocument();
    expect(screen.queryByText('New definition')).not.toBeInTheDocument();
  });

  it.each(['fixed', 'generated'] as const)(
    'requires a deliberate Concept choice for a new %s Question',
    async (kind) => {
      renderEditor();
      const concept = await screen.findByRole('combobox', { name: 'Primary skill practised' });
      expect(concept).toHaveValue('');
      fireEvent.change(screen.getByPlaceholderText('Completing the square'), {
        target: { value: 'Deliberate choice' },
      });
      if (kind === 'generated') {
        fireEvent.click(screen.getByRole('button', { name: 'Generated family' }));
      } else {
        fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'What is 2 + 2?' } });
        fireEvent.change(screen.getByLabelText('Expected answer'), { target: { value: '4' } });
        fireEvent.change(screen.getByLabelText('Worked explanation'), {
          target: { value: 'Combine the pairs.' },
        });
      }
      fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));

      expect(concept).toHaveFocus();
      expect(concept).toHaveAccessibleDescription('Choose the primary skill practised.');
      expect(concept).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByPlaceholderText('Completing the square')).toHaveValue('Deliberate choice');
      expect(mocks.createFixed).not.toHaveBeenCalled();
      expect(mocks.createGenerated).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();

      chooseConcept();
      fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
      await waitFor(() =>
        expect(kind === 'fixed' ? mocks.createFixed : mocks.createGenerated).toHaveBeenCalledWith(
          expect.objectContaining({ courseId: 'course-1', targetConceptId: 'concept-1' }),
        ),
      );
    },
  );

  it('creates a fixed Question with a worked explanation and one target Concept', async () => {
    renderEditor();

    fireEvent.change(await screen.findByPlaceholderText('Completing the square'), {
      target: { value: 'Apply addition' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'What is 2 + 2?' } });
    fireEvent.change(screen.getByLabelText('Expected answer'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Worked explanation'), {
      target: { value: 'Combine the two pairs to get four.' },
    });
    chooseConcept();
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));

    await waitFor(() =>
      expect(mocks.createFixed).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 'course-1',
          name: 'Apply addition',
          targetConceptId: 'concept-1',
          prompt: 'What is 2 + 2?',
          explanation: 'Combine the two pairs to get four.',
          payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
        }),
      ),
    );
    expect(await screen.findByText('Questions list')).toBeInTheDocument();
    expect(loadDraft(questionDraftKey('course-1'))).toBeNull();
  });

  it('starts at the prompt and reports missing fields where they are, focusing the first', async () => {
    renderEditor();
    const prompt = await screen.findByLabelText('Prompt');
    await waitFor(() => expect(prompt).toHaveFocus());
    fireEvent.change(prompt, { target: { value: 'What is 2 + 2?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));

    expect(screen.getByLabelText('Expected answer')).toHaveFocus();
    expect(screen.getByText('Add a valid answer.')).toBeInTheDocument();
    expect(screen.getByText('Add a name.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Completing the square')).toHaveAccessibleDescription(
      'Add a name.',
    );
    expect(prompt).toHaveValue('What is 2 + 2?');
    expect(mocks.createFixed).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it.each(['alternative', 'tolerance'] as const)(
    'focuses the invalid %s through the numeric editor and preserves it for correction',
    async (kind) => {
      renderEditor();
      const prompt = await screen.findByRole('textbox', { name: 'Prompt' });
      fireEvent.change(prompt, { target: { value: 'Give an accepted value.' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Expected answer' }), {
        target: { value: '4' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: 'Worked explanation' }), {
        target: { value: 'Use the accepted values.' },
      });
      const name = screen.getByPlaceholderText('Completing the square');
      fireEvent.change(name, { target: { value: 'Precise numeric focus' } });
      chooseConcept();
      fireEvent.click(
        screen.getByRole('button', {
          name: kind === 'alternative' ? 'One of' : 'Tolerance',
        }),
      );
      if (kind === 'alternative') {
        fireEvent.click(screen.getByRole('button', { name: 'Add accepted answer' }));
      }
      const invalid =
        kind === 'alternative'
          ? screen.getByRole('textbox', { name: 'Accepted answer 2' })
          : screen.getByRole('spinbutton', { name: 'Plus or minus' });
      if (kind === 'tolerance') fireEvent.change(invalid, { target: { value: '-1' } });

      name.focus();
      fireEvent.keyDown(name, { key: 'Enter', ctrlKey: true, isComposing: true, keyCode: 229 });
      expect(name).toHaveFocus();
      expect(screen.queryByText('Add a valid answer.')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
      await waitFor(() => expect(invalid).toHaveFocus());
      expect(prompt).toHaveValue('Give an accepted value.');
      expect(mocks.createFixed).not.toHaveBeenCalled();
      name.focus();
      fireEvent.keyDown(name, { key: 'Enter', metaKey: true });
      await waitFor(() => expect(invalid).toHaveFocus());

      fireEvent.change(invalid, { target: { value: kind === 'alternative' ? '5' : '0.1' } });
      fireEvent.keyDown(invalid, { key: 'Enter', ctrlKey: true });
      await waitFor(() =>
        expect(mocks.createFixed).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Precise numeric focus',
            targetConceptId: 'concept-1',
            payload: {
              v: 1,
              kind: 'numeric',
              answer:
                kind === 'alternative'
                  ? { kind: 'matches-one-of', values: ['4', '5'] }
                  : { kind: 'within', value: '4', tolerance: 0.1 },
            },
          }),
        ),
      );
      await waitFor(() => expect(prompt).toHaveValue(''));
      await waitFor(() => expect(prompt).toHaveFocus());
    },
  );

  it.each([
    [
      'Minimum root magnitude',
      '0',
      '1',
      'Enter a whole number from 1 to 20.',
      'minimumRootMagnitude',
    ],
    [
      'Minimum root magnitude',
      '10',
      '3',
      'Use a minimum root magnitude no greater than the maximum.',
      'minimumRootMagnitude',
    ],
    [
      'Maximum root magnitude',
      '21',
      '5',
      'Enter a whole number from 1 to 20.',
      'maximumRootMagnitude',
    ],
    [
      'Maximum leading coefficient',
      '1.5',
      '2',
      'Enter a whole number from 1 to 9.',
      'maximumLeadingCoefficient',
    ],
  ])(
    'keeps invalid generator input inline and focuses %s (%s)',
    async (label, invalid, valid, message, key) => {
      renderEditor();
      fireEvent.click(await screen.findByRole('button', { name: 'Generated family' }));
      fireEvent.change(screen.getByPlaceholderText('Completing the square'), {
        target: { value: 'Retained family' },
      });
      chooseConcept();
      const field = screen.getByRole('spinbutton', { name: label });
      fireEvent.change(field, { target: { value: invalid } });
      fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });

      expect(field).toHaveFocus();
      expect(field).toHaveValue(Number(invalid));
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(message);
      expect(screen.getByPlaceholderText('Completing the square')).toHaveValue('Retained family');
      expect(mocks.createGenerated).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();

      fireEvent.change(field, { target: { value: valid } });
      expect(field).toHaveFocus();
      expect(field).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByText(message)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
      expect(await screen.findByText('Questions list')).toBeInTheDocument();
      expect(mocks.createGenerated).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Retained family',
          targetConceptId: 'concept-1',
          generatorConfig: expect.objectContaining({
            [key]: Number(valid),
          }),
        }),
      );
    },
  );

  it('creates the audited built-in quadratic Question family', async () => {
    mocks.createGenerated.mockResolvedValue(undefined);
    renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'Generated family' }));
    fireEvent.change(screen.getByPlaceholderText('Completing the square'), {
      target: { value: 'Integer-root quadratics' },
    });
    chooseConcept();
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));

    await waitFor(() =>
      expect(mocks.createGenerated).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 'course-1',
          name: 'Integer-root quadratics',
          targetConceptId: 'concept-1',
          generatorKey: 'integer-root-quadratic',
          generatorVersion: 1,
          generatorConfig: {
            minimumRootMagnitude: 1,
            maximumRootMagnitude: 5,
            maximumLeadingCoefficient: 2,
            allowRepeatedRoots: false,
          },
        }),
      ),
    );
  });

  it('brings the replacement answer editor in through the continuity transition', async () => {
    renderEditor();

    expect(await screen.findByLabelText('Expected answer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show working' }));

    expect(screen.getByText('Working answer editor').parentElement).toHaveStyle({ opacity: '0' });
  });

  it('brings the generated-family mode in through the same surface transition', async () => {
    renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'Generated family' }));

    const family = screen.getByRole('heading', {
      name: 'Integer-root quadratic equations',
    }).parentElement;
    expect(family?.parentElement).toHaveStyle({ opacity: '0' });
  });
});
