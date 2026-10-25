import {
  notify,
  updateCard,
  createCourseCard,
  writeClipboardText,
  generatedCard,
  renderEditing,
  renderNew,
  chooseType,
  editorState,
} from './CardEditor.testSupport';
import { describe, expect, it, beforeEach } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';

describe('CardEditor — numeric items', () => {
  it('creates a numeric item with its answer in the structured payload', async () => {
    renderNew();
    chooseType('Numeric answer');
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'What is 8 / 2?' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Expected answer' }), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));

    await waitFor(() =>
      expect(createCourseCard).toHaveBeenCalledWith(
        'course-1',
        'front_back',
        'What is 8 / 2?',
        '',
        [],
        { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
        undefined,
      ),
    );
  });

  it('loads and updates an existing numeric item without exposing a Back field', async () => {
    editorState.card = {
      ...generatedCard,
      sequenceItemId: undefined,
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
    };
    renderEditing();

    expect(screen.getByRole('button', { name: 'Numeric answer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByPlaceholderText(/Answer\. Markdown/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Expected answer' }), {
      target: { value: '8 / 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(updateCard).toHaveBeenCalledWith(
        'card-1',
        expect.objectContaining({
          type: 'front_back',
          back: '',
          payload: {
            v: 1,
            kind: 'numeric',
            answer: { kind: 'exact', value: '8 / 2' },
          },
        }),
      ),
    );
  });
});

describe('CardEditor — working items', () => {
  it('copies a compiler-backed mark-scheme prompt for the current question', async () => {
    renderNew();
    chooseType('Working');
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Show that x = 4.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft mark scheme' }));

    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledOnce());
    const prompt = writeClipboardText.mock.calls[0][0] as string;
    expect(prompt).toContain('Show that x = 4.');
    expect(prompt).toContain('[1] answer :: equals :: 4');
    expect(prompt).toContain('Predicate vocabulary:');
  });

  it('creates a working item with the compiled scheme in its structured payload', async () => {
    renderNew();
    chooseType('Working');
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Show that x = 4.' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Scheme source' }), {
      target: { value: '[1] substitution :: 2x = 8\n[2] answer :: equals :: 4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));

    await waitFor(() =>
      expect(createCourseCard).toHaveBeenCalledWith(
        'course-1',
        'front_back',
        'Show that x = 4.',
        '',
        [],
        {
          v: 1,
          kind: 'working',
          scheme: [
            { marks: 1, label: 'substitution', kind: 'waypoint', expression: '2x = 8' },
            {
              marks: 2,
              label: 'answer',
              kind: 'predicate',
              predicate: 'equals',
              args: ['4'],
            },
          ],
        },
        undefined,
      ),
    );
  });

  it('does not save while any mark-scheme line is invalid', async () => {
    renderNew();
    chooseType('Working');
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Show your working.' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Scheme source' }), {
      target: { value: '[1] valid :: 4\nmissing marks' },
    });

    expect(screen.getByRole('button', { name: 'Add card' })).toBeDisabled();
    expect(createCourseCard).not.toHaveBeenCalled();
  });

  it('loads a persisted working scheme as editable source', () => {
    editorState.card = {
      ...generatedCard,
      sequenceItemId: undefined,
      payload: {
        v: 1,
        kind: 'working',
        scheme: [{ marks: 1, label: 'answer', kind: 'waypoint', expression: 'x = 4' }],
      },
    };
    renderEditing();

    expect(screen.getByRole('button', { name: 'Working' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Scheme source' })).toHaveValue(
      '[1] answer :: x = 4',
    );
    expect(screen.queryByPlaceholderText(/Answer\. Markdown/)).not.toBeInTheDocument();
  });

  it('persists pinned working fixtures with the item', async () => {
    renderNew();
    chooseType('Working');
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Solve for x.' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Scheme source' }), {
      target: { value: '[1] answer :: equals :: 4' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Test student answer' }), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pin as fixture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    await waitFor(() =>
      expect(createCourseCard).toHaveBeenCalledWith(
        'course-1',
        'front_back',
        'Solve for x.',
        '',
        [],
        expect.objectContaining({
          kind: 'working',
          fixtures: [expect.objectContaining({ studentAnswer: ['4'], expectedMarks: 1 })],
        }),
        undefined,
      ),
    );
  });
});

describe('CardEditor — real specialised authoring controls', () => {
  beforeEach(() => {
    editorState.realMarkdown = true;
  });

  function fillNumeric() {
    renderNew();
    chooseType('Numeric answer');
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), {
      target: { value: '2 + 2?' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Expected answer' }), {
      target: { value: '4' },
    });
  }

  it('blocks repeated keyboard and pointer saves during a pending write', async () => {
    let complete!: () => void;
    createCourseCard.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    fillNumeric();
    const answer = screen.getByRole('textbox', { name: 'Expected answer' });
    fireEvent.keyDown(answer, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(answer, { key: 'Enter', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }));
    expect(createCourseCard).toHaveBeenCalledTimes(1);
    await act(async () => complete());
    expect(screen.getByText('1 added', { exact: true })).toBeInTheDocument();
  });

  it('retains a failed numeric save, explains it and allows retry', async () => {
    createCourseCard.mockRejectedValueOnce(new Error('Disk full'));
    fillNumeric();
    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Could not save the card. Try again.', 'negative'),
    );
    expect(screen.getByRole('textbox', { name: 'Expected answer' })).toHaveValue('4');
    expect(screen.getByRole('textbox', { name: 'Question' })).toHaveValue('2 + 2?');
    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }));
    await screen.findByText('1 added', { exact: true });
    expect(createCourseCard).toHaveBeenCalledTimes(2);
  });

  it('focuses and explains the first invalid field on a save shortcut', async () => {
    renderNew();
    chooseType('Numeric answer');
    let prompt = screen.getByRole('textbox', { name: 'Question' });
    fireEvent.keyDown(prompt, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Question' })).toHaveFocus());
    expect(notify).toHaveBeenLastCalledWith('Enter a question or prompt.', 'negative');
    prompt = screen.getByRole('textbox', { name: 'Question' });
    fireEvent.change(prompt, { target: { value: '2 + 2?' } });
    fireEvent.keyDown(prompt, { key: 'Enter', ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Expected answer' })).toHaveFocus(),
    );
    expect(notify).toHaveBeenLastCalledWith(
      'Enter at least one valid numeric answer without variables.',
      'negative',
    );
    expect(createCourseCard).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });
    expect(screen.getByRole('textbox', { name: 'Expected answer' })).toHaveFocus();
  });

  it('leaves composing mark-scheme suggestion keys to the input method', () => {
    renderNew();
    chooseType('Working');
    const source = screen.getByRole('textbox', { name: 'Scheme source' });
    fireEvent.change(source, { target: { value: '[', selectionStart: 1 } });
    fireEvent.keyDown(source, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(source).toHaveValue('[');
    fireEvent.keyDown(source, { key: 'Tab', keyCode: 229 });
    expect(source).toHaveValue('[');
    fireEvent.keyDown(source, { key: 'Enter', ctrlKey: true });
    expect(source).toHaveValue('[1] ');
    expect(createCourseCard).not.toHaveBeenCalled();
  });
});
