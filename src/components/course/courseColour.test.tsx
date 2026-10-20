import { render, screen, within } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ForecastChart, type ForecastLine } from '../dashboard/ForecastChart';
import { TodayQueue, type QueueRow } from '../dashboard/TodayQueue';
import { CourseRow } from '../layout/SidebarCourseRow';
import { SidebarFrame } from '../layout/SidebarMotion';
import { courseColours } from '../../course/colour';

vi.mock('../../state/ShellCourseData', () => ({
  useCourseColours: () => courseColours(courses.map((course) => course.id)),
}));

const courses = [
  { id: 'biology', name: 'Biology' },
  { id: 'history', name: 'History' },
  { id: 'physics', name: 'Physics' },
];
const now = Date.UTC(2026, 9, 20);

describe('course identity colours', () => {
  it('keeps the same course colour in the queue, sidebar, legend and series after ranking changes', () => {
    const view = (reverse: boolean, filtered = false) => {
      const visible = filtered ? courses.slice(1) : courses;
      const ordered = reverse ? [...visible].reverse() : visible;
      const lines: ForecastLine[] = ordered.map((course, index) => ({
        ...course,
        status: 'steady',
        forecast: {
          end: now + 28 * 86_400_000,
          hasExam: true,
          target: 0.9,
          ifStopped: 0.8 - index * 0.1,
        },
        history: [
          { at: now - 86_400_000, recall: 0.7 },
          { at: now, recall: 0.8 - index * 0.1 },
        ],
      }));
      const rows: QueueRow[] = ordered.map((course) => ({
        ...course,
        status: 'steady',
        state: 'clear',
        due: 0,
        minutes: 0,
        href: `/course/${course.id}`,
        hasPendingUpdate: false,
      }));
      return (
        <MemoryRouter>
          <LazyMotion features={domAnimation}>
            <SidebarFrame collapsed={reverse} drawer={false} multiplier={0}>
              <nav aria-label="Courses">
                {courses.map((course) => (
                  <CourseRow
                    key={course.id}
                    courseId={course.id}
                    courseName={course.name}
                    glyph={{
                      days: course.id === 'physics' ? 12 : null,
                      recall: 0.8,
                      status: 'behind',
                      load: 0,
                    }}
                    lessons={[]}
                    expanded={new Set()}
                    onToggle={() => {}}
                    collapsed={reverse}
                    compact={false}
                    m={0}
                  />
                ))}
              </nav>
            </SidebarFrame>
            <ForecastChart lines={lines} now={now} past={18} future={12} multiplier={0} />
            <TodayQueue rows={rows} multiplier={0} onStudy={() => {}} onMenu={() => {}} />
          </LazyMotion>
        </MemoryRouter>
      );
    };
    const { container, rerender } = render(view(false));
    const colours = new Map<string, string>();
    const assertColours = (visible = courses) => {
      const queue = screen.getByRole('region', { name: 'Today, most urgent first' });
      const legend = screen.getByRole('list', { name: 'Courses' });
      const sidebar = screen.getByRole('navigation', { name: 'Courses' });
      for (const course of visible) {
        const marker = within(queue)
          .getByRole('button', { name: course.name })
          .parentElement!.querySelector('span[aria-hidden]') as HTMLElement;
        const swatch = within(legend)
          .getByRole('button', { name: course.name })
          .querySelector('span[aria-hidden]') as HTMLElement;
        const colour = swatch.style.background;
        expect(marker.style.background).toBe(colour);
        const icon = within(sidebar).getByRole('link', { name: course.name }).querySelector('svg')!;
        const link = icon.closest('a')!;
        if (course.id === 'physics') {
          expect((link.querySelector('.tabular-nums') as HTMLElement).style.color).toBe(colour);
        } else {
          expect(icon.querySelector('path:last-child')).toHaveAttribute('stroke', colour);
        }
        expect(icon.querySelectorAll('path')[1]).toHaveAttribute('stroke', 'hsl(var(--warning))');
        expect(
          container.querySelector(`svg[role="img"] g[data-course-id="${course.id}"] path`),
        ).toHaveAttribute('stroke', colour);
        if (colours.has(course.id)) expect(colour).toBe(colours.get(course.id));
        colours.set(course.id, colour);
      }
      expect(new Set(colours.values()).size).toBe(3);
    };
    assertColours();
    rerender(view(true));
    assertColours();
    rerender(view(true, true));
    assertColours(courses.slice(1));
  });
});
