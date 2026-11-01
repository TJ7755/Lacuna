import {
  mockNavigate,
  mockUpdateCourse,
  mockNotify,
  mockCourse,
  course,
  setCourseData,
} from './Dashboard.testSupport';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dashboard } from './Dashboard';

describe('Dashboard course actions', () => {
  it('opens the course menu under its More button without navigating, then dismisses it', async () => {
    setCourseData();
    render(<Dashboard />);
    const more = screen.getByRole('button', { name: 'More for Test Course' });
    vi.spyOn(more, 'getBoundingClientRect').mockReturnValue({
      right: 500,
      bottom: 100,
      left: 456,
      top: 56,
      width: 44,
      height: 44,
      x: 456,
      y: 56,
      toJSON: () => ({}),
    });

    fireEvent.click(more);
    const menu = await screen.findByRole('menu', { name: 'Actions for Test Course' });
    expect(menu).toHaveStyle({ left: '340px', top: '106px' });
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the course menu with Escape and returns focus to the More button', async () => {
    setCourseData();
    render(<Dashboard />);
    const more = screen.getByRole('button', { name: 'More for Test Course' });

    fireEvent.click(more);
    const menu = await screen.findByRole('menu');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it.each(['ContextMenu', 'F10'])(
    'opens the course actions with %s on the course title',
    async (key) => {
      setCourseData();
      render(<Dashboard />);
      const link = screen.getByRole('button', { name: 'Test Course' });
      act(() => link.focus());
      fireEvent.keyDown(link, { key, shiftKey: key === 'F10' });
      expect(await screen.findByRole('menuitem', { name: 'Archive' })).toHaveFocus();
      expect(mockNavigate).not.toHaveBeenCalled();
    },
  );

  it('opens visible course actions on right-click while preserving selected text menus', async () => {
    setCourseData();
    render(<Dashboard />);
    const link = screen.getByRole('button', { name: 'Test Course' });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(link);
    selection.addRange(range);
    expect(fireEvent.contextMenu(link)).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    selection.removeAllRanges();
    expect(fireEvent.contextMenu(link)).toBe(false);
    expect(await screen.findByRole('menuitem', { name: 'Archive' })).toHaveFocus();
  });

  it('cancels archiving from the confirmation dialog', async () => {
    setCourseData();
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'More for Test Course' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(await screen.findByRole('dialog', { name: 'Archive Test Course?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockUpdateCourse).not.toHaveBeenCalled();
  });

  it.each([false, true])('dismisses the course menu on Tab (shift: %s)', async (shiftKey) => {
    setCourseData();
    render(<Dashboard />);
    const more = screen.getByRole('button', { name: 'More for Test Course' });
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Archive' }), {
      key: 'Tab',
      shiftKey,
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the Archive menu action at the shared minimum target size', async () => {
    setCourseData();
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'More for Test Course' }));
    expect(await screen.findByRole('menuitem', { name: 'Archive' })).toHaveClass('min-h-11');
  });

  it.each([false, true])('returns focus after archiving (last course: %s)', async (lastCourse) => {
    setCourseData(lastCourse ? [mockCourse] : [mockCourse, course('course-2', 'Second Course')]);
    const { rerender } = render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'More for Test Course' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    const confirm = await screen.findByRole('button', { name: 'Archive course' });
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() => expect(mockNotify).toHaveBeenCalled());
    setCourseData(
      lastCourse
        ? [{ ...mockCourse, archived: true }]
        : [{ ...mockCourse, archived: true }, course('course-2', 'Second Course')],
    );
    rerender(<Dashboard />);
    await waitFor(() =>
      expect(
        lastCourse
          ? screen.getByRole('heading', { name: 'Today' })
          : screen.getByRole('button', { name: 'More for Second Course' }),
      ).toHaveFocus(),
    );
  });

  it('archives a course, allows Undo and drops the archived course from the queue', async () => {
    setCourseData();
    const { rerender } = render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'More for Test Course' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive course' }));

    await waitFor(() =>
      expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { archived: true }),
    );
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith(
        'Test Course archived',
        'positive',
        expect.objectContaining({ actionLabel: 'Undo' }),
      ),
    );

    setCourseData([{ ...mockCourse, archived: true }]);
    rerender(<Dashboard />);
    expect(screen.queryByRole('button', { name: 'Test Course' })).not.toBeInTheDocument();

    const options = mockNotify.mock.calls[0][2] as { onAction: () => void };
    options.onAction();
    await waitFor(() =>
      expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { archived: false }),
    );
  });

  it('keeps the confirmation open and reports an archive failure', async () => {
    mockUpdateCourse.mockRejectedValueOnce(new Error('database unavailable'));
    setCourseData();
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'More for Test Course' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive course' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The course could not be archived. Nothing was changed.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
