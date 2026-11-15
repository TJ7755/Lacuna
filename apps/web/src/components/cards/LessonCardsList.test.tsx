import { fireEvent, render, screen } from '@testing-library/react';
import type { Card } from '@lacuna/core/db/types';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LessonCardsList } from './LessonCardsList';

vi.mock('../../state/useCourseData', () => ({ useOcclusions: () => [] }));

function renderList(
  focusNewCard: boolean,
  editable = true,
  cards: Card[] = [],
  onNavigate = vi.fn(),
) {
  render(
    <LazyMotion features={domAnimation}>
      <MemoryRouter>
        <LessonCardsList
          courseId="c1"
          lessonId="l1"
          cards={cards}
          editable={editable}
          onNavigate={onNavigate}
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

  it('preserves links inside Markdown while opening the surrounding preview in the lesson', async () => {
    const onNavigate = vi.fn();
    renderList(
      false,
      false,
      [
        {
          id: 'card',
          type: 'front_back',
          front: 'Read [Reference](https://example.com)',
          back: 'Answer',
          lastReviewed: null,
          due: null,
        } as Card,
      ],
      onNavigate,
    );
    const reference = await screen.findByRole('link', { name: 'Reference' });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(reference, click);
    expect(click.defaultPrevented).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Read', { exact: false, selector: 'p' }));
    expect(onNavigate).toHaveBeenCalledWith(
      '/course/c1/lesson/l1/cards?card=card',
      expect.anything(),
    );
    expect(screen.getByRole('link', { name: 'View card: Read Reference' })).toBeInTheDocument();
  });
});
