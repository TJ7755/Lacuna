import {
  mockNavigate,
  mockCreateLesson,
  mockUpdateCourse,
  mockCreatePracticeNode,
  mockCreateCourseAssessment,
  mockUpdateCourseAssessment,
  mockDeleteCourseAssessment,
  course,
  lesson1,
  practiceNode,
  renderPage,
  resetCoursePathFixtures,
  pathState,
} from './CoursePath.testFixtures';
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MS_PER_DAY } from '../fsrs/params';
describe('CoursePath Edit mode', () => {
  beforeEach(resetCoursePathFixtures);
  beforeEach(() => {
    pathState.mockCourse = { ...course, lessonViewMode: 'edit' };
  });

  it('creates manual practice from the path', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Card practice' }));
    expect(screen.getByRole('dialog', { name: 'Add card practice' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(mockCreatePracticeNode).toHaveBeenCalledWith(
        'course-1',
        expect.objectContaining({ type: 'manual', name: 'Card practice', position: 1 }),
      );
    });
  });

  it('creates a checkpoint from the path', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Checkpoint' }));
    expect(screen.getByRole('dialog', { name: 'Add checkpoint' })).toBeInTheDocument();
    const nameInput = screen.getByRole('textbox', { name: 'Name' });
    expect(nameInput).toHaveFocus();
    fireEvent.change(nameInput, {
      target: { value: 'Paper 1' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(mockCreateCourseAssessment).toHaveBeenCalledWith(
        'course-1',
        'Paper 1',
        expect.any(Number),
        expect.objectContaining({ afterLessonId: 'lesson-2', coverageMode: 'prefix' }),
      );
    });
  });

  it('keeps a new checkpoint open with an inline error when Done has no name', async () => {
    renderPage();
    const opener = screen.getByRole('button', { name: 'Add' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Checkpoint' }));

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await screen.findByText('Enter a name.');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('restores the Add checkpoint control after closing checkpoint creation with Escape', async () => {
    renderPage();
    const opener = screen.getByRole('button', { name: 'Add' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Checkpoint' }));

    const nameInput = screen.getByRole('textbox', { name: 'Name' });
    expect(nameInput).toHaveFocus();
    fireEvent.change(nameInput, { target: { value: 'New checkpoint' } });
    fireEvent.keyDown(nameInput, { key: 'Escape' });

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('keeps Tab trapped in the checkpoint editor when its date picker is open', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Checkpoint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose date and time' }));

    const done = screen.getAllByRole('button', { name: 'Done' }).at(-1)!;
    done.focus();
    fireEvent.keyDown(done, { key: 'Tab' });

    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog', { name: 'Choose date and time' })).getAllByRole(
          'button',
        )[0],
      ).toHaveFocus(),
    );
  });

  it('edits a checkpoint directly from its path node', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit checkpoint: Paper 1' }));

    expect(screen.getByRole('dialog', { name: 'Edit checkpoint' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Paper 1 details' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Revised Paper 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(mockUpdateCourseAssessment).toHaveBeenCalledWith(
        'assessment-1',
        expect.objectContaining({ name: 'Revised Paper 1' }),
      );
    });
  });

  it('moves a checkpoint by the same lesson anchor with Alt+Arrow as its menu', async () => {
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
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit checkpoint: Paper 1' }), {
      key: 'ArrowDown',
      altKey: true,
    });
    await waitFor(() =>
      expect(mockUpdateCourseAssessment).toHaveBeenCalledWith('assessment-1', {
        afterLessonId: 'lesson-2',
      }),
    );
  });

  it('confirms checkpoint deletion before removing it from the repository', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit checkpoint: Paper 1' }));
    const deleteTrigger = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteTrigger);

    expect(screen.getByText('Delete this checkpoint?')).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog', { name: 'Delete' })).getByRole('button', {
        name: 'Delete',
      }),
    ).toHaveFocus();
    expect(mockDeleteCourseAssessment).not.toHaveBeenCalled();

    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    await waitFor(() => {
      expect(mockDeleteCourseAssessment).toHaveBeenCalledWith('assessment-1');
    });
  });

  it('restores the checkpoint Delete trigger after cancelling deletion', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit checkpoint: Paper 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Delete' }), { key: 'Escape' });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus());
    expect(mockDeleteCourseAssessment).not.toHaveBeenCalled();
  });

  it('creates practice at the single lesson position from the ladder', async () => {
    pathState.mockLessons = [lesson1];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Card practice' }));
    expect(screen.getByRole('dialog', { name: 'Add card practice' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(mockCreatePracticeNode).toHaveBeenCalledWith(
        'course-1',
        expect.objectContaining({ type: 'manual', name: 'Card practice', position: 0 }),
      );
    });
  });

  it('anchors a single-lesson checkpoint after that lesson', async () => {
    pathState.mockLessons = [lesson1];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Checkpoint' }));

    const nameInput = screen.getByRole('textbox', { name: 'Name' });
    expect(nameInput).toHaveFocus();
    fireEvent.change(nameInput, { target: { value: 'Solo checkpoint' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(mockCreateCourseAssessment).toHaveBeenCalledWith(
        'course-1',
        'Solo checkpoint',
        expect.any(Number),
        expect.objectContaining({ afterLessonId: 'lesson-1', coverageMode: 'prefix' }),
      );
    });
  });

  it('opens the editor from the practice-node menu', () => {
    pathState.mockPracticeNodes = [practiceNode];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Practice actions: Weekly review' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit card practice' })).toBeInTheDocument();
  });

  it('creates a lesson from an empty path', async () => {
    pathState.mockLessons = [];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lesson' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create lesson' }));

    await waitFor(() => {
      expect(mockCreateLesson).toHaveBeenCalledWith('course-1', 'Lesson 1');
      expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-3');
    });
  });

  it('creates a lesson from a populated path', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lesson' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create lesson' }));

    await waitFor(() => {
      expect(mockCreateLesson).toHaveBeenCalledWith('course-1', 'Lesson 3');
      expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-3');
    });
  });

  it('renames the course from its header', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Rename course' }));
    const input = screen.getByRole('textbox', { name: 'Course name' });
    fireEvent.change(input, { target: { value: 'Further mechanics' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { name: 'Further mechanics' });
    });
  });
});
