import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LessonHeader } from './LessonHeader';

describe('LessonHeader keyboard rename', () => {
  afterEach(cleanup);

  it.each(['Escape', 'Enter'])('returns focus to Rename lesson after %s', async (key) => {
    const onRename = vi.fn();
    render(<LessonHeader title="Cells" onRename={onRename} />);
    const trigger = screen.getByRole('button', { name: 'Rename lesson' });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByRole('textbox', { name: 'lesson name' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Organelles' } });
    fireEvent.keyDown(input, { key });
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Rename lesson' })).toHaveFocus();
    expect(onRename).toHaveBeenCalledTimes(key === 'Enter' ? 1 : 0);
  });

  it('preserves focus on the next control when blur saves the name', async () => {
    render(
      <>
        <LessonHeader title="Cells" onRename={vi.fn()} />
        <button>Next action</button>
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Rename lesson' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Organelles' } });
    const next = screen.getByRole('button', { name: 'Next action' });
    next.focus();
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(next).toHaveFocus();
  });

  it('returns focus to a persistent lesson actions control', async () => {
    render(
      <LessonHeader
        title="Cells"
        onRename={vi.fn()}
        actions={(startRename) => <button onClick={startRename}>Lesson actions</button>}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Lesson actions' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
