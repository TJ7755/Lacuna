import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { SimpleLearnOptions } from './SimpleLearnOptions';

const { useLessons } = vi.hoisted(() => ({ useLessons: vi.fn() }));
vi.mock('../../state/useCourseData', () => ({ useLessons }));

beforeEach(() => {
  useLessons.mockReset();
  useLessons.mockReturnValue([{ id: 'lesson-1', name: 'Cells' }]);
});

it('defers lesson subscriptions until expanded and preserves the selection when reopened', () => {
  const { container } = render(
    <MemoryRouter>
      <SimpleLearnOptions courseId="course-1" />
    </MemoryRouter>,
  );
  expect(useLessons).not.toHaveBeenCalled();
  const disclosure = container.querySelector('details')!;
  disclosure.open = true;
  fireEvent(disclosure, new Event('toggle'));
  expect(useLessons).toHaveBeenCalledWith('course-1');
  fireEvent.change(screen.getByLabelText('Simple Learn scope'), { target: { value: 'lesson-1' } });
  disclosure.open = false;
  fireEvent(disclosure, new Event('toggle'));
  expect(screen.queryByLabelText('Simple Learn scope')).not.toBeInTheDocument();
  disclosure.open = true;
  fireEvent(disclosure, new Event('toggle'));
  expect(screen.getByLabelText('Simple Learn scope')).toHaveValue('lesson-1');
});
