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
    const input = screen.getByRole('textbox', { name: 'Course name' });
    expect(screen.queryByRole('heading', { name: 'Mechanics' })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mechanics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename course' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Rename course' }));
    expect(screen.getByRole('textbox', { name: 'Course name' })).toHaveFocus();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
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
    const input = screen.getByRole('textbox', { name: 'Course name' });
    fireEvent.change(input, { target: { value: 'Further mechanics' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Further mechanics'));
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
    const input = screen.getByRole('textbox', { name: 'Lesson name' });
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
