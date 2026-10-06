import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CourseHeader } from './CourseHeader';

// Happy DOM rejects cancelled native-animation promises; exercise Motion's real JS fallback.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
});
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

describe('CourseHeader', () => {
  it('removes the rename field immediately on Escape and restores the edit control without overlapping titles', async () => {
    render(
      <LazyMotion features={domAnimation}>
        <CourseHeader title="Mechanics" onRename={vi.fn()} />
      </LazyMotion>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rename course' }));
    const input = screen.getByRole('textbox', { name: 'course name' });
    expect(screen.queryByRole('heading', { name: 'Mechanics' })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mechanics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename course' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Rename course' }));
    expect(screen.getByRole('textbox', { name: 'course name' })).toHaveFocus();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
  });
  it('keeps the course visibility marker on the stable header during renaming', () => {
    render(<CourseHeader title="Mechanics" onRename={vi.fn()} />);
    const header = screen.getByRole('heading', { name: 'Mechanics' }).closest('header');
    expect(header).toHaveAttribute('data-course-title');
    fireEvent.click(screen.getByRole('button', { name: 'Rename course' }));
    expect(screen.getByRole('textbox', { name: 'course name' }).closest('header')).toBe(header);
    expect(header).toHaveAttribute('data-course-title');
  });

  it('does not mistake a lesson heading for the course identity', () => {
    const { container } = render(<CourseHeader title="Momentum" renameLabel="lesson" />);
    expect(container.querySelector('[data-course-title]')).toBeNull();
  });

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
