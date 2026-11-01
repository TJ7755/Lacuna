import { render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LessonCardsList } from './LessonCardsList';

vi.mock('../../state/useCourseData', () => ({ useOcclusions: () => [] }));

function renderList(focusNewCard: boolean, editable = true) {
  render(
    <LazyMotion features={domAnimation}>
      <MemoryRouter>
        <LessonCardsList
          courseId="c1"
          lessonId="l1"
          cards={[]}
          editable={editable}
          onNavigate={vi.fn()}
          focusNewCard={focusNewCard}
        />
      </MemoryRouter>
    </LazyMotion>,
  );
}

describe('LessonCardsList', () => {
  it('focuses New card when asked, ready for the first card', () => {
    renderList(true);
    expect(screen.getByRole('button', { name: 'New card' })).toHaveFocus();
  });

  it('leaves focus alone otherwise', () => {
    renderList(false);
    expect(screen.getByRole('button', { name: 'New card' })).not.toHaveFocus();
  });
});
