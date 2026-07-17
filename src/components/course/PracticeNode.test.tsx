import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PracticePathNode } from '../../course/path';
import { PracticeNode } from './PracticeNode';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

const node: PracticePathNode = {
  id: 'practice-auto-course-lesson-1',
  nodeType: 'practice-auto',
  afterLessonId: 'lesson-1',
  nodeKey: 'practice-auto-course-lesson-1',
};

describe('PracticeNode', () => {
  it('shows secured scope progress on the perimeter', () => {
    const { container } = render(
      <PracticeNode
        node={node}
        onClick={() => undefined}
        progress={{ fraction: 0.42, completed: false }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Practice: Practice, 42% secured' })).toBeEnabled();
    const progressPath = container.querySelectorAll('polygon')[1];
    expect(Number(progressPath.getAttribute('stroke-dashoffset'))).toBeCloseTo(0.58);
  });

  it('announces and glows for a persisted completion', () => {
    render(
      <PracticeNode
        node={node}
        onClick={() => undefined}
        progress={{ fraction: 0.7, completed: true }}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Practice: Practice, 70% secured, completed' }),
    ).toHaveClass('shadow-[0_0_18px_color-mix(in_srgb,var(--color-accent)_32%,transparent)]');
  });

  it('names the urgent assessment and keeps its action distinct from Practice', () => {
    const onPractice = vi.fn();
    const onAssessment = vi.fn();
    render(
      <PracticeNode
        node={node}
        onClick={onPractice}
        assessment={{
          assessmentId: 'assessment-1',
          name: 'Paper 1',
          examDate: Date.now() + 86_400_000,
          eligibleCount: 3,
        }}
        onAssessmentClick={onAssessment}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Prioritise Paper 1' }));
    expect(onAssessment).toHaveBeenCalledOnce();
    expect(onPractice).not.toHaveBeenCalled();
  });
});
