import {
  dashboardState,
  mockNavigate,
  mockOpenStudySheet,
  mockCourse,
  DAY,
  course,
  summary,
  setCourseData,
  queueTitles,
} from './Dashboard.testSupport';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from './Dashboard';

describe('Dashboard Today queue', () => {
  it('ends a pending onboarding once the learner reaches Today', () => {
    localStorage.setItem('lacuna-onboarding', 'pending');
    setCourseData();
    render(<Dashboard />);
    expect(localStorage.getItem('lacuna-onboarding')).toBe('done');
    localStorage.removeItem('lacuna-onboarding');
  });

  it('opens class-code entry from Today', () => {
    setCourseData();
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('link', { name: 'Join a class' }));
    expect(mockNavigate).toHaveBeenCalledWith('/?import=1&join=1');
  });

  it('keeps new lessons available without marking their cards as due', () => {
    setCourseData([course('poems', 'Poems', { examDate: undefined })], {
      summaries: { poems: summary(0, { completedLessonCount: 0 }) },
    });
    render(<Dashboard />);
    expect(screen.getByLabelText('Today: 0 cards, about 0 minutes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Study Poems' }));
    expect(mockOpenStudySheet).toHaveBeenCalledWith('poems');
  });

  it('estimates due minutes without counting new or later-today cards as due work', () => {
    setCourseData([mockCourse], {
      summaries: { [mockCourse.id]: summary(2) },
      minutes: { [mockCourse.id]: 30 },
      forecastCardCounts: { [mockCourse.id]: 10 },
    });
    render(<Dashboard />);
    expect(screen.getByLabelText('Today: 2 cards, about 6 minutes')).toBeInTheDocument();
  });

  it('does not render a sharing announcement on Today', async () => {
    localStorage.clear();
    setCourseData();
    render(<Dashboard />);
    await act(() => vi.dynamicImportSettled());

    expect(screen.getByRole('region', { name: 'Today, most urgent first' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'New sharing features' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Explore sharing/ })).not.toBeInTheDocument();
  });

  it('renders skeleton when data is loading', async () => {
    vi.useFakeTimers();
    try {
      render(<Dashboard />);
      // Verify the actual delay, independently of load on the machine running the suite.
      await act(() => vi.advanceTimersByTime(199));
      expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
      await act(() => vi.advanceTimersByTime(1));
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('withholds the loading skeleton while a load could still finish instantly', () => {
    render(<Dashboard />);
    expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('renders empty state when no courses exist', () => {
    setCourseData([]);
    render(<Dashboard />);
    const emptyHeading = screen.getByRole('heading', { name: 'No courses yet' });
    expect(emptyHeading).toBeInTheDocument();
    expect(emptyHeading.parentElement).toHaveClass('flex', 'flex-col', 'items-center');
    const create = screen.getByRole('button', { name: 'New course' });
    expect(emptyHeading.parentElement).toContainElement(create);
    fireEvent.click(create);
    expect(create).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('new-course-form')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Today:/)).not.toBeInTheDocument();
  });

  it('does not render archived courses or restoration controls', () => {
    setCourseData([{ ...mockCourse, archived: true }]);
    render(<Dashboard />);

    expect(screen.queryByRole('heading', { name: 'Archived courses' })).not.toBeInTheDocument();
    expect(screen.queryByText('Test Course')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No active courses' })).toBeInTheDocument();
  });

  it('retains an open toolbar form when initial data resolves to an empty course list', () => {
    const { rerender } = render(<Dashboard />);
    const trigger = screen.getByRole('button', { name: 'New course' });
    fireEvent.click(trigger);
    const form = screen.getByTestId('new-course-form');
    setCourseData([]);
    rerender(<Dashboard />);
    expect(screen.getByTestId('new-course-form')).toBe(form);
    expect(screen.getByRole('button', { name: 'New course' })).toBe(trigger);
  });

  it('keeps the first-course importer mounted until its creation session closes', () => {
    setCourseData([]);
    const { rerender } = render(<Dashboard />);
    const trigger = screen.getByRole('button', { name: 'New course' });
    fireEvent.click(trigger);
    const form = screen.getByTestId('new-course-form');
    setCourseData();
    rerender(<Dashboard />);
    expect(screen.getByTestId('new-course-form')).toBe(form);
    expect(screen.getByRole('button', { name: 'New course' })).toBe(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByTestId('new-course-form')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Today, most urgent first' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New course' })).not.toBe(trigger);
  });

  it('excludes archived courses from the queue and the totals', () => {
    setCourseData([mockCourse, course('course-2', 'Archived Course', { archived: true })], {
      summaries: { 'course-1': summary(4), 'course-2': summary(9) },
      minutes: { 'course-1': 6, 'course-2': 30 },
    });
    render(<Dashboard />);

    expect(screen.queryByText('Archived Course')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Today: 4 cards, about 6 minutes')).toBeInTheDocument();
  });

  it('has a visually hidden Today heading', () => {
    setCourseData();
    render(<Dashboard />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Today' });
    expect(heading).toHaveClass('sr-only');
  });

  it('never reads a non-empty queue as zero minutes', () => {
    setCourseData([mockCourse], {
      summaries: { 'course-1': summary(2) },
      minutes: { 'course-1': 0.2 },
    });
    render(<Dashboard />);
    expect(screen.getByLabelText('Today: 2 cards, about 1 minute')).toBeInTheDocument();
  });

  it('totals the cards and minutes due across active courses', () => {
    setCourseData([mockCourse, course('course-2', 'Second Course')], {
      summaries: { 'course-1': summary(7), 'course-2': summary(5) },
      minutes: { 'course-1': 10.4, 'course-2': 4 },
    });
    render(<Dashboard />);
    expect(screen.getByLabelText('Today: 12 cards, about 14 minutes')).toBeInTheDocument();
  });

  it('opens each course row without a native link', () => {
    setCourseData([mockCourse], { summaries: { 'course-1': summary(3) } });
    render(<Dashboard />);
    const link = screen.getByRole('button', { name: 'Test Course' });
    expect(link).not.toHaveAttribute('href');
    fireEvent.click(link);
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1');
    expect(screen.queryByText('Update ready')).not.toBeInTheDocument();
  });

  it('opens update review and flags the row when a course has pending changes', () => {
    setCourseData();
    dashboardState.mockPendingUpdateIds = new Set(['course-1']);

    render(<Dashboard />);

    const link = screen.getByRole('button', { name: 'Test Course Update available' });
    fireEvent.click(link);
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/updates');
    expect(link).toHaveTextContent('Update available');
  });

  it("opens the course's session plan from Study, as the course page does", () => {
    setCourseData([mockCourse], { summaries: { 'course-1': summary(3) } });
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Study Test Course' }));
    expect(mockOpenStudySheet).toHaveBeenCalledWith('course-1');
    expect(mockNavigate).not.toHaveBeenCalledWith('/course/course-1/study');
  });

  it("shows Done for today and no Study button once today's work is finished", () => {
    setCourseData([mockCourse, course('course-2', 'Busy Course')], {
      summaries: { 'course-1': summary(0, { reviewedTodayCount: 4 }), 'course-2': summary(2) },
    });
    render(<Dashboard />);

    expect(screen.getAllByText('Done for today')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Study Test Course' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Study Busy Course' })).toBeInTheDocument();
    // The row stays reachable and keeps its menu.
    expect(screen.getByRole('button', { name: 'Test Course' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More for Test Course' })).toBeInTheDocument();
  });

  // Regression for #445: an empty or untouched course is not finished study.
  it('never celebrates a course with no cards, nothing studied or no summary yet', () => {
    setCourseData(
      [
        course('empty', 'Empty Course'),
        course('quiet', 'Quiet Course'),
        course('loading', 'Loading Course'),
      ],
      {
        summaries: {
          empty: summary(0, { cardCount: 0 }),
          quiet: summary(0),
        },
      },
    );
    render(<Dashboard />);

    expect(screen.queryByText('Done for today')).not.toBeInTheDocument();
    expect(screen.getByText('No cards yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing due')).toBeInTheDocument();
    for (const name of ['Empty Course', 'Quiet Course', 'Loading Course']) {
      expect(screen.queryByRole('button', { name: `Study ${name}` })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('studies with S the course whose Study button leads, skipping nearer courses with no work', () => {
    const now = Date.now();
    setCourseData(
      [
        course('near', 'Near Exam', { examDate: now + 2 * DAY }),
        course('far', 'Far Exam', { examDate: now + 30 * DAY }),
      ],
      { summaries: { near: summary(0), far: summary(3) } },
    );
    render(<Dashboard />);

    expect(queueTitles().map((link) => link.textContent)).toEqual(['Near Exam', 'Far Exam']);
    fireEvent.keyDown(window, { key: 's' });
    expect(mockOpenStudySheet).toHaveBeenCalledWith('far');
    expect(mockOpenStudySheet).not.toHaveBeenCalledWith('near');
  });

  it('leaves S without an action when no course has work to study', () => {
    setCourseData([mockCourse], { summaries: { 'course-1': summary(0) } });
    render(<Dashboard />);

    fireEvent.keyDown(window, { key: 's' });
    expect(mockOpenStudySheet).not.toHaveBeenCalled();
  });

  it('orders rows most urgent first: nearest exam, then larger workload, no-exam last', () => {
    const now = Date.now();
    setCourseData(
      [
        course('none-small', 'No Exam Small', { examDate: undefined }),
        course('far', 'Far Exam', { examDate: now + 30 * DAY }),
        course('none-big', 'No Exam Big', { examDate: undefined }),
        course('near', 'Near Exam', { examDate: now + 3 * DAY }),
        course('past', 'Past Exam', { examDate: now - DAY }),
      ],
      {
        summaries: {
          'none-small': summary(1),
          far: summary(20),
          'none-big': summary(9),
          near: summary(2),
          past: summary(5),
        },
      },
    );
    render(<Dashboard />);

    // A past exam no longer counts as an exam, so it ranks among the no-exam courses.
    expect(queueTitles().map((link) => link.textContent)).toEqual([
      'Near Exam',
      'Far Exam',
      'No Exam Big',
      'Past Exam',
      'No Exam Small',
    ]);
  });
});
