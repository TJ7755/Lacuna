import { render, screen, waitFor } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@lacuna/core/db/types';
import { CourseRow } from './SidebarCourseRow';
import { SidebarFrame } from './SidebarMotion';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));

const lessons = [
  { id: 'treaty', courseId: 'history', name: 'The Treaty of Versailles' },
  { id: 'policy', courseId: 'history', name: 'Foreign policy' },
] as Lesson[];

describe('sidebar course disclosure', () => {
  it.each([false, true])(
    'retains measured lessons across closing, reversal and rail changes (drawer: %s)',
    async (drawer) => {
      const view = (open: boolean, collapsed = false) => (
        <MemoryRouter>
          <LazyMotion features={domAnimation}>
            <SidebarFrame collapsed={collapsed} drawer={drawer} multiplier={0}>
              <CourseRow
                courseId="history"
                courseName="History"
                glyph={{ days: null, recall: 0, status: 'steady', load: 0 }}
                lessons={lessons}
                expanded={new Set(open ? ['history'] : [])}
                onToggle={vi.fn()}
                collapsed={collapsed}
                compact={false}
                m={0}
              />
            </SidebarFrame>
          </LazyMotion>
        </MemoryRouter>
      );
      const { rerender } = render(view(false));
      const lesson = screen.getByRole('link', {
        name: lessons[0].name,
        hidden: true,
      });
      const panel = document.getElementById(
        screen.getByRole('button', { name: 'Expand History' }).getAttribute('aria-controls')!,
      )!;
      expect(panel).toContainElement(lesson);
      expect(panel).toHaveAttribute('inert');
      expect(panel).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByRole('link', { name: lessons[0].name })).toBeNull();
      await waitFor(() => expect(panel.style.height).toBe('0px'));

      rerender(view(true));
      expect(screen.getByRole('link', { name: lessons[0].name })).toBe(lesson);
      expect(panel).not.toHaveAttribute('inert');
      expect(screen.getByRole('button', { name: 'Collapse History' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      rerender(view(false));
      expect(panel).toHaveAttribute('inert');
      rerender(view(true));
      expect(screen.getByRole('link', { name: lessons[0].name })).toBe(lesson);

      rerender(view(true, true));
      expect(panel).toHaveAttribute('inert');
      await waitFor(() => expect(panel.style.height).toBe('0px'));
      rerender(view(true));
      expect(screen.getByRole('link', { name: lessons[0].name })).toBe(lesson);
    },
  );
});
