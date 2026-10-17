import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { open, resetEditorData, setup } from './questionSetEditorTestSupport';

describe('Question composer keyboard', () => {
  beforeEach(resetEditorData);

  it('opens on the first question without focusing the title and supports the writing loop', async () => {
    const course = await setup();
    open(course.id);
    const question = await screen.findByLabelText('Q1 question');
    expect(question).toHaveFocus();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
    fireEvent.change(question, { target: { value: 'Name the organelle.' } });
    fireEvent.keyDown(question, { key: 'Tab' });
    expect(screen.getByLabelText('Q1 mark scheme')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Q1 mark scheme'), { target: { value: 'Nucleus' } });
    fireEvent.keyDown(screen.getByLabelText('Q1 mark scheme'), { key: 'Tab' });
    expect(screen.getByLabelText('Q2 question')).toHaveFocus();
    expect(screen.getByLabelText('Q1 marks')).toHaveAttribute('tabindex', '-1');
    screen.getByLabelText('Q1 marks').focus();
    fireEvent.keyDown(screen.getByLabelText('Q1 marks'), { key: 'Enter' });
    expect(screen.getByLabelText('Q2 question')).toHaveFocus();
    expect(screen.getByLabelText('Q3 question')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Q1 row options' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it.each(['mark scheme', 'marks'])(
    'tabs from a middle %s to the next question without inserting a row',
    async (field) => {
      const course = await setup();
      open(course.id);
      fireEvent.change(await screen.findByLabelText('Q1 question'), { target: { value: 'First' } });
      fireEvent.change(screen.getByLabelText('Q1 mark scheme'), {
        target: { value: 'First point' },
      });
      fireEvent.click(screen.getByRole('button', { name: '+ Question' }));
      fireEvent.change(screen.getByLabelText('Q2 question'), { target: { value: 'Second' } });
      const input = screen.getByLabelText(`Q1 ${field}`);
      input.focus();
      fireEvent.keyDown(input, { key: 'Tab' });
      expect(screen.getByLabelText('Q2 question')).toHaveFocus();
      expect(screen.queryByLabelText('Q3 question')).not.toBeInTheDocument();
    },
  );

  it.each(['mark scheme', 'marks'])(
    'tabs from the last %s to a newly inserted question',
    async (field) => {
      const course = await setup();
      open(course.id);
      fireEvent.change(await screen.findByLabelText('Q1 question'), { target: { value: 'First' } });
      const scheme = screen.getByLabelText('Q1 mark scheme');
      fireEvent.change(scheme, { target: { value: 'First point' } });
      const input = screen.getByLabelText(`Q1 ${field}`);
      input.focus();
      fireEvent.keyDown(input, { key: 'Tab' });
      expect(screen.getByLabelText('Q2 question')).toHaveFocus();
      expect(screen.getByLabelText('Q2 question')).toHaveValue('');
    },
  );

  it('shift-tabs from a question to the previous scheme with the caret at its end', async () => {
    const course = await setup();
    open(course.id);
    fireEvent.change(await screen.findByLabelText('Q1 question'), { target: { value: 'First' } });
    const scheme = screen.getByLabelText('Q1 mark scheme') as HTMLTextAreaElement;
    fireEvent.change(scheme, { target: { value: 'First point' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Question' }));
    const question = screen.getByLabelText('Q2 question');
    fireEvent.change(question, { target: { value: 'Second' } });
    question.focus();
    fireEvent.keyDown(question, { key: 'Tab', shiftKey: true });
    expect(scheme).toHaveFocus();
    expect(scheme.selectionStart).toBe(scheme.value.length);
    expect(scheme.selectionEnd).toBe(scheme.value.length);
  });

  it('shift-tabs from a populated part to its stem question', async () => {
    const course = await setup();
    open(course.id);
    const stem = await screen.findByLabelText('Q1 question');
    fireEvent.change(stem, { target: { value: 'Shared source' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Part' }));
    const part = screen.getByLabelText('Q1 (a) question');
    fireEvent.change(part, { target: { value: 'Describe it' } });
    part.focus();
    fireEvent.keyDown(part, { key: 'Tab', shiftKey: true });
    expect(stem).toHaveFocus();
    expect(screen.queryByLabelText('Q1 mark scheme')).not.toBeInTheDocument();
  });

  it.each(['', 'First question'])(
    'leaves Shift+Tab on the first question to the browser (%s)',
    async (value) => {
      const course = await setup();
      open(course.id);
      const question = await screen.findByLabelText('Q1 question');
      fireEvent.change(question, { target: { value } });
      question.focus();
      expect(fireEvent.keyDown(question, { key: 'Tab', shiftKey: true })).toBe(true);
    },
  );

  it('keeps empty-part outdenting ahead of backwards navigation', async () => {
    const course = await setup();
    open(course.id);
    fireEvent.change(await screen.findByLabelText('Q1 question'), {
      target: { value: 'Shared source' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Part' }));
    const part = screen.getByLabelText('Q1 (a) question');
    part.focus();
    fireEvent.keyDown(part, { key: 'Tab', shiftKey: true });
    expect(screen.getByLabelText('Q2 question')).toHaveFocus();
    expect(screen.queryByLabelText('Q1 (a) question')).not.toBeInTheDocument();
  });

  it('enters marks from the end of the scheme and selects the override', async () => {
    const course = await setup();
    open(course.id);
    await screen.findByLabelText('Q1 question');
    const scheme = screen.getByLabelText('Q1 mark scheme') as HTMLTextAreaElement;
    const marks = screen.getByLabelText('Q1 marks') as HTMLInputElement;
    fireEvent.change(scheme, { target: { value: 'First point' } });
    fireEvent.change(marks, { target: { value: '12' } });
    scheme.focus();
    scheme.setSelectionRange(scheme.value.length, scheme.value.length);
    expect(scheme).toHaveAttribute('aria-keyshortcuts', 'ArrowRight');
    fireEvent.keyDown(scheme, { key: 'ArrowRight' });
    expect(marks).toHaveFocus();
    expect(marks.selectionStart).toBe(0);
    expect(marks.selectionEnd).toBe(2);
    expect(marks).toHaveAttribute('tabindex', '-1');
  });

  it('leaves ArrowRight to text editing inside the scheme and for a selection', async () => {
    const course = await setup();
    open(course.id);
    await screen.findByLabelText('Q1 question');
    const scheme = screen.getByLabelText('Q1 mark scheme') as HTMLTextAreaElement;
    fireEvent.change(scheme, { target: { value: 'First point' } });
    scheme.focus();
    for (const [start, end] of [
      [2, 2],
      [0, scheme.value.length],
    ]) {
      scheme.setSelectionRange(start, end);
      expect(fireEvent.keyDown(scheme, { key: 'ArrowRight' })).toBe(true);
      expect(scheme).toHaveFocus();
    }
  });

  it.each(['empty', 'start', 'shift-tab'] as const)(
    'returns from marks to the scheme end (%s)',
    async (position) => {
      const course = await setup();
      open(course.id);
      await screen.findByLabelText('Q1 question');
      const scheme = screen.getByLabelText('Q1 mark scheme') as HTMLTextAreaElement;
      const marks = screen.getByLabelText('Q1 marks') as HTMLInputElement;
      fireEvent.change(scheme, { target: { value: 'First point' } });
      if (position !== 'empty') fireEvent.change(marks, { target: { value: '12' } });
      marks.focus();
      if (position === 'start') marks.setSelectionRange(0, 0);
      fireEvent.keyDown(
        marks,
        position === 'shift-tab' ? { key: 'Tab', shiftKey: true } : { key: 'ArrowLeft' },
      );
      expect(scheme).toHaveFocus();
      expect(scheme.selectionStart).toBe(scheme.value.length);
      expect(scheme.selectionEnd).toBe(scheme.value.length);
    },
  );

  it('leaves ArrowLeft to text editing within a marks value', async () => {
    const course = await setup();
    open(course.id);
    await screen.findByLabelText('Q1 question');
    const marks = screen.getByLabelText('Q1 marks') as HTMLInputElement;
    fireEvent.change(marks, { target: { value: '12' } });
    marks.focus();
    marks.setSelectionRange(1, 1);
    expect(fireEvent.keyDown(marks, { key: 'ArrowLeft' })).toBe(true);
    expect(marks).toHaveFocus();
  });
});
