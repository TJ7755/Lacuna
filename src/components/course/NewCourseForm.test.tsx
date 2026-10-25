import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewCourseForm } from './NewCourseForm';
import { defaultExamDate, fromDateTimeLocalValue, getLocalTimeZone } from '../../utils/datetime';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  prefetchRoute: vi.fn(),
  notify: vi.fn(),
  createCourse: vi.fn(),
  createLesson: vi.fn(),
}));

vi.mock('../../routes/prefetch', () => ({ prefetchRoute: mocks.prefetchRoute }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));
vi.mock('../../db/courseRepository', () => ({ createCourse: mocks.createCourse }));
vi.mock('../../db/lessonRepository', () => ({ createLesson: mocks.createLesson }));
vi.mock('../import/ShareLinkImport', () => ({
  ShareLinkImport: ({ onOpenCourse }: { onOpenCourse: (id: string) => void }) => (
    <button type="button" onClick={() => onOpenCourse('library-course')}>
      Add to my courses
    </button>
  ),
}));
describe('NewCourseForm', () => {
  it('leads with the course library and imports a library course in place', async () => {
    const onClose = vi.fn();
    render(<NewCourseForm onClose={onClose} inline />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Course library/ }));

    const search = screen.getByRole('searchbox', { name: 'Search the course library' });
    expect(search).toHaveFocus();
    // Enter in the search never creates a course from the hidden form.
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.change(search, { target: { value: '8461' } });
    fireEvent.click(screen.getByRole('button', { name: /^Biology/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Back to the course library' })).toHaveFocus(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to my courses' }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/course/library-course');
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });

  it('steps back out of the library with Escape, one level at a time', async () => {
    const onClose = vi.fn();
    render(<NewCourseForm onClose={onClose} inline />);
    fireEvent.click(screen.getByRole('button', { name: /Course library/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the course library' }), {
      target: { value: '8461' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Biology/ }));
    const back = screen.getByRole('button', { name: 'Back to the course library' });
    fireEvent.keyDown(back, { key: 'Escape' });
    const search = screen.getByRole('searchbox', { name: 'Search the course library' });
    fireEvent.keyDown(search, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Course library/ })).toHaveFocus(),
    );
    expect(screen.getByLabelText('Course name')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves the library out when onboarding has already offered it', () => {
    render(<NewCourseForm onClose={vi.fn()} inline library={false} />);
    expect(screen.queryByRole('button', { name: /Course library/ })).not.toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-11T12:00:00Z'));
    mocks.createCourse.mockResolvedValue({ id: 'new-course' });
    mocks.createLesson.mockResolvedValue({ id: 'new-lesson' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warms the course and inline lesson routes while the form is open', () => {
    render(<NewCourseForm onClose={vi.fn()} inline />);
    expect(mocks.prefetchRoute).toHaveBeenCalledWith('/course/new');
    expect(mocks.prefetchRoute).toHaveBeenCalledWith('/course/new/lesson/new');
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });

  it('can expand inline without a modal or keyboard trap, and cancels with Escape', () => {
    const onClose = vi.fn();
    const { container } = render(<NewCourseForm onClose={onClose} inline />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'New course' });
    expect(container).toContainElement(form);
    const input = screen.getByRole('textbox', { name: 'Course name' });
    expect(input).toHaveFocus();
    const create = screen.getByRole('button', { name: 'Create' });
    create.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    create.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('associates the visible course name label with the input', () => {
    render(<NewCourseForm onClose={vi.fn()} />);

    const input = screen.getByRole('textbox', { name: 'Course name' });
    expect(screen.getByLabelText('Course name')).toBe(input);
    expect(screen.getByText('Course name', { selector: 'label' })).toHaveAttribute('for', input.id);
    expect(input).not.toHaveAttribute('placeholder');
  });

  it('defaults to steady retention and shows the exam date only once chosen', () => {
    render(<NewCourseForm onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'New course' }).parentElement?.parentElement).toBe(
      document.body,
    );
    expect(screen.getByRole('radio', { name: /Exam date/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Steady retention/ })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Exam date and time' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Exam date/ }));

    const picker = screen.getByRole('button', { name: 'Exam date and time' });
    const expected = defaultExamDate(Date.parse('2026-08-11T12:00:00Z'));
    const expectedDate = new Date(expected).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: getLocalTimeZone(),
    });

    expect(picker).toHaveTextContent(`${expectedDate} · 23:59`);
  });

  it('creates an exam-targeted course after that target is selected', async () => {
    render(<NewCourseForm onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Course name'), {
      target: { value: 'Biology' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Exam date/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mocks.createCourse).toHaveBeenCalledWith('Biology', {
        schedulingMode: 'exam',
        examDate: defaultExamDate(Date.parse('2026-08-11T12:00:00Z')),
        timeZone: getLocalTimeZone(),
      }),
    );
    expect(mocks.createLesson).toHaveBeenCalledWith('new-course', 'Lesson 1');
    expect(mocks.navigate).toHaveBeenCalledWith('/course/new-course', {
      state: { focusNewCard: true },
    });
  });

  it('creates a steady-retention course without fabricating an exam date', async () => {
    render(<NewCourseForm onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Course name'), {
      target: { value: 'Spanish' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mocks.createCourse).toHaveBeenCalledWith('Spanish', {
        schedulingMode: 'steady',
      }),
    );
  });

  it('passes a changed wall-clock time without shifting its time zone', async () => {
    render(<NewCourseForm onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Course name'), {
      target: { value: 'Biology' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Exam date/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Exam date and time' }));
    fireEvent.click(screen.getByRole('button', { name: '20 August 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mocks.createCourse).toHaveBeenCalledWith('Biology', {
        schedulingMode: 'exam',
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
    fireEvent.change(screen.getByLabelText('Course name'), {
      target: { value: 'Biology' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Exam date/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Exam date and time' }));
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
    fireEvent.change(screen.getByLabelText('Course name'), {
      target: { value: 'Biology' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Exam date/ }));

    const trigger = screen.getByRole('button', { name: 'Exam date and time' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(mocks.createCourse).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Hour' }), { key: 'Enter' });
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });

  it('shows inline validation instead of silently ignoring a blank course', () => {
    render(<NewCourseForm onClose={vi.fn()} />);

    const input = screen.getByLabelText('Course name');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a course name before creating the course.',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });
});

it('keeps course creation separate from import', () => {
  render(<NewCourseForm onClose={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Import cards' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Import share code' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
});
