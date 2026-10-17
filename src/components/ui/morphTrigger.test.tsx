import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as MotionReact from 'motion/react';
import { expect, it, vi } from 'vitest';
import { CourseStudyActions } from '../course/CourseStudyActions';
import { AddCourseControl } from '../course/AddCourseControl';
import { ImportControl } from '../import/ImportControl';
import { TodayQueue } from '../dashboard/TodayQueue';
import { Button } from './Button';
import { ExpandingCreateControl } from './ExpandingCreateControl';

vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof MotionReact>('motion/react');
  const { createElement, forwardRef } = await import('react');
  const MotionButton = forwardRef<HTMLButtonElement, MotionReact.HTMLMotionProps<'button'>>(
    function MotionButton(
      { whileTap, whileHover, transition: _transition, animate: _animate, ...props },
      ref,
    ) {
      return createElement('button', {
        ...props,
        ref,
        'data-tap-scale':
          typeof whileTap === 'object' && !Array.isArray(whileTap) ? whileTap.scale : undefined,
        'data-hover-scale':
          typeof whileHover === 'object' && !Array.isArray(whileHover)
            ? whileHover.scale
            : undefined,
      });
    },
  );
  return {
    ...actual,
    m: new Proxy(actual.m, {
      get(target, property) {
        return property === 'button' ? MotionButton : Reflect.get(target, property);
      },
    }),
  };
});

const studyActions = () => (
  <CourseStudyActions
    courseId="course"
    dueCount={1}
    doneToday={0}
    onStudy={vi.fn()}
    otherWays={[]}
  />
);

it.each([
  ['Study', studyActions],
  ['Other ways to study', studyActions],
  [
    'Study Biology',
    () => (
      <TodayQueue
        rows={[
          {
            id: 'biology',
            name: 'Biology',
            status: 'ahead',
            state: 'study',
            due: 1,
            minutes: 1,
            href: '/course/biology',
            hasPendingUpdate: false,
          },
        ]}
        multiplier={1}
        onStudy={vi.fn()}
        onMenu={vi.fn()}
      />
    ),
  ],
  [
    'New course',
    () => (
      <ExpandingCreateControl label="New course" open={false} onOpenChange={vi.fn()}>
        <input aria-label="Name" />
      </ExpandingCreateControl>
    ),
  ],
  ['Import', () => <ImportControl />],
  ['Add', () => <AddCourseControl onAdd={vi.fn()} />],
])('lets the morph own press feedback for %s', (label, view) => {
  render(<MemoryRouter>{view()}</MemoryRouter>);
  const trigger = screen.getByRole('button', { name: label });
  expect(trigger).toHaveAttribute('data-press', 'none');
  expect(trigger).not.toHaveAttribute('data-tap-scale');
  expect(trigger).not.toHaveAttribute('data-hover-scale');
});

it('keeps press and hover scaling on ordinary buttons', () => {
  render(<Button>Save</Button>);
  const button = screen.getByRole('button', { name: 'Save' });
  expect(button).toHaveAttribute('data-tap-scale', '0.96');
  expect(button).toHaveAttribute('data-hover-scale', '1.02');
  expect(button).toHaveAttribute('data-press', '');
});
