import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewCourseForm } from './NewCourseForm';
import { defaultExamDate, fromDateTimeLocalValue, getLocalTimeZone } from '../../utils/datetime';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  notify: vi.fn(),
  createCourse: vi.fn(),
  createLesson: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));
vi.mock('../../db/repository', () => ({
  createCourse: mocks.createCourse,
  createLesson: mocks.createLesson,
}));
vi.mock('../import/UnifiedImportPanel', () => ({
  ShareCodeImportPanel: ({
    onShareImport,
  }: {
    onShareImport: (courses: number, cards: number, courseIds: string[]) => Promise<void>;
  }) => (
    <button type="button" onClick={() => void onShareImport(1, 2, ['imported-course'])}>
      Complete share import
    </button>
  ),
}));

describe('NewCourseForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-11T12:00:00Z'));
    mocks.createCourse.mockResolvedValue({ id: 'new-course' });
    mocks.createLesson.mockResolvedValue({ id: 'new-lesson' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the seven-day local default at 23:59', () => {
    render(<NewCourseForm onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'New course' }).parentElement?.parentElement).toBe(
      document.body,
    );
    const picker = screen.getByRole('button', { name: 'Exam date' });
    const expected = defaultExamDate(Date.parse('2026-08-11T12:00:00Z'));
    const expectedDate = new Date(expected).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: getLocalTimeZone(),
    });

    expect(picker).toHaveTextContent(`${expectedDate} · 23:59`);
    expect(screen.getByText('Lacuna schedules this course towards your exam.')).toBeInTheDocument();
  });

  it('keeps ordinary course creation as the default path', async () => {
    render(<NewCourseForm onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Course name'), {
      target: { value: 'Biology' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mocks.createCourse).toHaveBeenCalledWith('Biology', {
        examDate: defaultExamDate(Date.parse('2026-08-11T12:00:00Z')),
        timeZone: getLocalTimeZone(),
      }),
    );
    expect(mocks.createLesson).toHaveBeenCalledWith('new-course', 'Lesson 1');
    expect(mocks.navigate).toHaveBeenCalledWith('/course/new-course');
  });

  it('passes a changed wall-clock time without shifting its time zone', async () => {
    render(<NewCourseForm onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Course name'), {
      target: { value: 'Biology' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Exam date' }));
    fireEvent.click(screen.getByRole('button', { name: '20 August 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mocks.createCourse).toHaveBeenCalledWith('Biology', {
        examDate: fromDateTimeLocalValue('2026-08-20T23:59', getLocalTimeZone()),
        timeZone: getLocalTimeZone(),
      }),
    );
  });

  it('does not create a course from a nonexistent local time', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      locale: 'en-GB',
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'America/New_York',
    });
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-02-28T17:00:00Z'));
    render(<NewCourseForm onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Course name'), {
      target: { value: 'Biology' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Exam date' }));
    const hour = screen.getByRole('textbox', { name: 'Hour' });
    const minute = screen.getByRole('textbox', { name: 'Minute' });
    fireEvent.change(hour, { target: { value: '2' } });
    fireEvent.change(minute, { target: { value: '30' } });
    fireEvent.blur(minute);
    fireEvent.click(screen.getByRole('button', { name: '8 March 2026' }));

    expect(screen.getByRole('alert')).toHaveTextContent('does not exist');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(mocks.createCourse).not.toHaveBeenCalled();
    expect(hour).toHaveFocus();
  });

  it('does not submit while the date picker is handling keyboard input', () => {
    render(<NewCourseForm onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Course name'), {
      target: { value: 'Biology' },
    });

    const trigger = screen.getByRole('button', { name: 'Exam date' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(mocks.createCourse).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Hour' }), { key: 'Enter' });
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });

  it('shows inline validation instead of silently ignoring a blank course', () => {
    render(<NewCourseForm onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText('Course name');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a course name before creating the course.',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });

  it('offers share-code import and opens the imported course', async () => {
    const onClose = vi.fn();
    render(<NewCourseForm onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Import share code' }));
    expect(screen.queryByRole('button', { name: 'Exam date' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Complete share import' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.notify).toHaveBeenCalledWith('Added 1 course and 2 cards.', 'positive');
    expect(mocks.navigate).toHaveBeenCalledWith('/course/imported-course');
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });
});
