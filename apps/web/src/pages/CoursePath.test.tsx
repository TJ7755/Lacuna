import {
  mockNavigate,
  mockCreateLesson,
  mockUpdateCourse,
  live,
  mockOpenStudySheet,
  course,
  lesson1,
  lesson2,
  makeCard,
  showCompletedPractice,
  renderPage,
  resetCoursePathFixtures,
  pathState,
} from './CoursePath.testFixtures';
import { CoursePath } from './CoursePath';
import { expectAppDestination } from '../../../../tests/helpers/expectAppDestination';
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import type { QuestionSetPracticeNode } from '@lacuna/core/db/types';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
describe('CoursePath View mode', () => {
  beforeEach(resetCoursePathFixtures);
  it('displays checkpoint dates in the assessment time zone', () => {
    pathState.mockCourse = { ...course, timeZone: 'Europe/London' };
    pathState.mockAssessments = [
      {
        id: 'assessment-zone',
        courseId: course.id,
        kind: 'checkpoint',
        name: 'Zoned exam',
        examDate: Date.UTC(2027, 0, 2, 1),
        timeZone: 'America/Los_Angeles',
        afterLessonId: lesson1.id,
        coverageMode: 'prefix',
        excludedCardIds: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    renderPage();
    const deadlines = screen.getByRole('region', { name: 'Assessments' });
    expect(
      within(deadlines).getByRole('button', { name: /^1\s*Jan\s*Zoned exam/ }),
    ).toBeInTheDocument();
    expect(within(deadlines).queryByText(/Ongoing revision/)).not.toBeInTheDocument();
  });

  it.each(['Steady retention', 'Keep my biology fresh'])(
    'explains no-date revision beside the saved assessment title "%s"',
    (name) => {
      pathState.mockCourse = { ...course, schedulingMode: 'steady', examDate: undefined };
      pathState.mockAssessments = [
        {
          id: 'steady-assessment',
          courseId: course.id,
          kind: 'final',
          name,
          schedulingMode: 'steady',
          afterLessonId: null,
          coverageMode: 'prefix',
          excludedCardIds: [],
          createdAt: 0,
          updatedAt: 0,
        },
      ];

      renderPage();

      const assessments = screen.getByRole('region', { name: 'Assessments' });
      const revision = within(assessments).getByRole('button', { name: new RegExp(name) });
      expect(within(revision).getByText(name, { exact: true })).toBeVisible();
      expect(within(revision).getByText('All lessons')).toBeVisible();
      expect(within(revision).getByText('Ongoing revision with no exam date.')).toBeVisible();
    },
  );

  it('shows a one-lesson course as a path when it contains a Practice Qs activity', () => {
    pathState.mockLessons = [lesson1];
    const activity: QuestionSetPracticeNode = {
      id: 'question-set-activity-1',
      courseId: course.id,
      type: 'question-set',
      name: 'Practice Qs',
      questionSetIds: ['question-set-1'],
      afterLessonId: lesson1.id,
      createdAt: 1,
      updatedAt: 1,
    };
    pathState.mockPracticeNodes = [activity];

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Practice questions: Question set' }));
    expect(mockNavigate).toHaveBeenCalledWith(
      `/course/${course.id}/question-sets/${activity.questionSetIds[0]}`,
      expect.objectContaining({
        state: expect.objectContaining({ questionSetReturnTo: `/course/${course.id}` }),
      }),
    );
    expect(screen.getByRole('list', { name: 'Course path' })).toHaveTextContent('Kinematics');
  });

  it('opens an assessment deep link after the CoursePath is already mounted', async () => {
    pathState.mockAssessments = [
      {
        id: 'assessment-1',
        courseId: 'course-1',
        kind: 'checkpoint',
        name: 'Paper 1',
        examDate: Date.now() + MS_PER_DAY,
        afterLessonId: 'lesson-1',
        coverageMode: 'prefix',
        excludedCardIds: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    render(
      <MemoryRouter initialEntries={['/course/course-1']}>
        <ToastProvider>
          <Link to="/course/course-1?exam=assessment-1">Open path assessment link</Link>
          <Routes>
            <Route path="/course/:courseId" element={<CoursePath />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Open path assessment link' }));

    expect(await screen.findByRole('dialog', { name: 'Paper 1 details' })).toBeInTheDocument();
  });

  it('opens archived lessons for read-only inspection without exposing study or authoring exits', () => {
    pathState.mockCourse = {
      ...course,
      archived: true,
      lessonViewMode: 'edit',
      unlockMode: 'semi-linear',
    };

    renderPage();

    expect(screen.getByText('Archived course')).toBeInTheDocument();
    expectAppDestination(screen.getByRole('link', { name: 'Archived courses' }), '/archived');
    expect(screen.queryByRole('navigation', { name: 'Course sections' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Study' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Other ways to study' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename course' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kinematics' }));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-1');
    const previouslyLockedLesson = screen.getByRole('button', { name: 'Dynamics' });
    expect(previouslyLockedLesson).toBeEnabled();
    fireEvent.click(previouslyLockedLesson);
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-2');
    expect(mockUpdateCourse).not.toHaveBeenCalled();
  });

  it('offers one explicit Edit mode beside the course sections', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Edit mode' }));

    expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { lessonViewMode: 'edit' });
    expect(screen.queryByRole('button', { name: 'Read' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('keeps course figures in one compact card under the lessons, not under the title', () => {
    pathState.mockCourseCards = [makeCard('card-1', 'lesson-1')];
    renderPage();

    const summary = screen.getByRole('region', { name: 'Course summary' });
    expect(summary).toHaveTextContent('Exam-day recall');
    expect(summary).toHaveTextContent(/1\s*Card(?!s)/);
    expect(screen.queryByText(/cards? in \d+ lessons?/)).not.toBeInTheDocument();
  });

  it.each([1, 2])('opens the course session plan from Study and S with %i lessons', (count) => {
    pathState.mockLessons = [lesson1, lesson2].slice(0, count);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Study' }));
    expect(mockOpenStudySheet).toHaveBeenCalledWith('course-1');
    mockOpenStudySheet.mockClear();
    fireEvent.keyDown(window, { key: 's' });
    expect(mockOpenStudySheet).toHaveBeenCalledWith('course-1');
  });

  it.each([false, true])(
    'only exposes pending updates on active multi-lesson courses (archived=%s)',
    (archived) => {
      pathState.mockCourse = { ...course, archived };
      pathState.mockPendingMerge = {
        id: 'review-1',
        courseId: 'course-1',
        lineageId: 'lineage-1',
        revision: 2,
        diff: {
          creates: { lessons: [], notes: [], cards: [] },
          updates: { lessons: [], notes: [], cards: [] },
          removals: { lessonIds: [], noteIds: [], cardIds: [] },
          conflicts: [],
        },
        createdAt: 0,
      };

      renderPage();

      if (archived) {
        expect(screen.queryByRole('link', { name: 'Review updates' })).not.toBeInTheDocument();
        return;
      }
      expectAppDestination(
        screen.getByRole('link', { name: 'Review updates' }),
        '/course/course-1/updates',
      );
    },
  );

  it.each([false, true])(
    'only exposes pending updates on active single-lesson courses (archived=%s)',
    (archived) => {
      pathState.mockCourse = { ...course, archived };
      pathState.mockLessons = [lesson1];
      pathState.mockPendingMerge = {
        id: 'review-1',
        courseId: 'course-1',
        lineageId: 'lineage-1',
        revision: 2,
        diff: {
          creates: { lessons: [], notes: [], cards: [] },
          updates: { lessons: [], notes: [], cards: [] },
          removals: { lessonIds: [], noteIds: [], cardIds: [] },
          conflicts: [],
        },
        createdAt: 0,
      };

      renderPage();

      if (archived) {
        expect(screen.queryByRole('link', { name: 'Review updates' })).not.toBeInTheDocument();
        return;
      }
      expectAppDestination(
        screen.getByRole('link', { name: 'Review updates' }),
        '/course/course-1/updates',
      );
    },
  );

  it.each([1, 2])(
    'keeps study options available after all %i lessons are complete',
    async (count) => {
      pathState.mockLessons = [lesson1, lesson2].slice(0, count);
      pathState.mockCourseCards = pathState.mockLessons.map((lesson) => ({
        ...makeCard(`card-${lesson.id}`, lesson.id),
        state: 2,
        stability: 10,
        lastReviewed: Date.now(),
        due: Date.now() + MS_PER_DAY,
      }));
      live.exposures = pathState.mockCourseCards.map((card) => ({
        lessonId: card.primaryLessonId!,
        cardId: card.id,
        taughtAt: 1,
        updatedAt: 1,
      }));

      renderPage();

      expect(screen.getByRole('button', { name: 'Study' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Study' }));
      expect(mockOpenStudySheet).toHaveBeenCalledWith('course-1');
      expect(screen.queryByText(/next lesson available/i)).not.toBeInTheDocument();
    },
  );

  it('hides start, end and mid-path Manual practice', () => {
    renderPage();
    expect(
      screen.queryByRole('button', { name: 'Add manual practice here' }),
    ).not.toBeInTheDocument();
  });

  it('hides the practice-node pencil on a visible practice node', () => {
    showCompletedPractice();
    renderPage();
    expect(screen.getByText('Weekly review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Weekly review' })).not.toBeInTheDocument();
  });

  it('names a practice node as Card practice for assistive technology', () => {
    showCompletedPractice();
    renderPage();
    expect(
      screen.getByRole('button', { name: /^Card practice: Weekly review/ }),
    ).toBeInTheDocument();
  });

  it('hides Add lesson on an empty path', () => {
    pathState.mockLessons = [];
    renderPage();
    expect(screen.getByText('This course has no lessons yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add lesson' })).not.toBeInTheDocument();
    expect(mockCreateLesson).not.toHaveBeenCalled();
  });

  it('hides Add lesson on a populated path', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Kinematics' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add lesson' })).not.toBeInTheDocument();
    expect(mockCreateLesson).not.toHaveBeenCalled();
  });

  it('hides the course rename control', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Mechanics' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename course' })).not.toBeInTheDocument();
    expect(mockUpdateCourse).not.toHaveBeenCalled();
  });

  it('hides path-authoring actions', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('keeps published content read-only while offering personal checkpoints', () => {
    pathState.mockCourse = {
      ...course,
      lessonViewMode: 'edit',
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
    };
    pathState.mockAssessments = [
      {
        id: 'assessment-1',
        courseId: 'course-1',
        kind: 'checkpoint',
        name: 'Paper 1',
        examDate: Date.now() + MS_PER_DAY,
        afterLessonId: 'lesson-1',
        coverageMode: 'prefix',
        excludedCardIds: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    renderPage();

    expect(
      screen.getByRole('link', { name: 'Authoring is locked for shared courses' }),
    ).toHaveAttribute('title', 'Authoring is locked for shared courses');
    expectAppDestination(
      screen.getByRole('link', { name: 'Authoring is locked for shared courses' }),
      '/course/course-1/settings',
    );
    expect(screen.queryByRole('button', { name: 'Edit mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add lesson' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename course' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open checkpoint: Paper 1' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit checkpoint: Paper 1' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.getByRole('menuitem', { name: 'Checkpoint' })).toBeInTheDocument();
  });
});
