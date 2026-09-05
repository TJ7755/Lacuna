import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CourseHeader } from './CourseHeader';

describe('CourseHeader', () => {
  it('places exam context after the title and actions in a labelled calendar row', () => {
    render(
      <CourseHeader eyebrow="Exam 1 June 2027" title="Mechanics">
        <button>Study</button>
      </CourseHeader>,
    );
    const context = screen.getByRole('group', { name: 'Study schedule' });
    expect(context).toHaveTextContent('Exam 1 June 2027');
    expect(
      screen.getByRole('button', { name: 'Study' }).compareDocumentPosition(context) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renames through the visible edit control', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    render(
      <CourseHeader
        eyebrow="Exam 1 June 2027"
        title="Mechanics"
        renameLabel="course"
        onRename={onRename}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename course' }));
    const input = screen.getByRole('textbox', { name: 'course name' });
    fireEvent.change(input, { target: { value: 'Further mechanics' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Further mechanics'));
  });

  it('crossfades the display title into the focused rename field', () => {
    render(
      <CourseHeader
        eyebrow="Exam 1 June 2027"
        title="Mechanics"
        renameLabel="course"
        onRename={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename course' }));

    expect(screen.getByRole('textbox', { name: 'course name' })).toHaveStyle({ opacity: '0' });
  });

  it('supports double-click editing and rejects a blank name', () => {
    const onRename = vi.fn();
    render(
      <CourseHeader
        eyebrow="Exam 1 June 2027"
        title="Algebra"
        renameLabel="lesson"
        onRename={onRename}
      />,
    );

    fireEvent.doubleClick(screen.getByRole('heading', { name: 'Algebra' }));
    const input = screen.getByRole('textbox', { name: 'lesson name' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Algebra' })).toBeInTheDocument();
  });

  it('does not expose rename controls without an update handler', () => {
    render(<CourseHeader eyebrow="Exam 1 June 2027" title="Locked course" />);
    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
  });
});
