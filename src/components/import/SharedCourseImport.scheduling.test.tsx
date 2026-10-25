import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SharedCourseImport } from './SharedCourseImport';
import { db } from '../../db/schema';
import { mergeLineageUpdate } from '../../db/mergeImport';
import type { SharePayloadV2 } from '../../db/share';
import {
  chooseStudyTarget,
  finishOnboarding,
  markOnboardingPending,
} from '../../onboarding/onboardingState';

vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => 0,
}));
vi.mock('../ui/DateTimePicker', () => ({
  DateTimePicker: ({
    value,
    onChange,
    onValidityChange,
  }: {
    value: number;
    onChange: (value: number) => void;
    onValidityChange: (valid: boolean) => void;
  }) => (
    <input
      aria-label="Exam instant"
      value={value}
      onChange={(event) => {
        const date = Number(event.target.value);
        onChange(date);
        onValidityChange(Number.isFinite(date));
      }}
    />
  ),
}));

const teacherDate = 1_900_000_000_000;
const learnerDate = 1_950_000_000_000;
function payload(): SharePayloadV2 {
  return {
    v: 2,
    at: 1000,
    li: 'ui-scheduling',
    rv: 1,
    course: { n: 'Biology', o: 0, c: 1000, e: teacherDate, um: 'open' },
    lessons: [
      {
        i: 'ui-lesson',
        n: 'Cells',
        notes: [],
        cards: [{ id: 'ui-card', k: 0, f: 'Question', b: 'Answer' }],
      },
    ],
  };
}
const courseFile = (source: SharePayloadV2) =>
  new File(
    [
      JSON.stringify({
        format: 'lacuna-course',
        version: 1,
        payload: source,
        assets: [],
      }),
    ],
    'Biology.lacuna',
  );

beforeEach(async () => {
  finishOnboarding();
  await db.delete();
  await db.open();
});

it('imports with the onboarding exam date over a teacher suggestion, without asking again', async () => {
  markOnboardingPending();
  chooseStudyTarget({ mode: 'exam', examDate: learnerDate });
  render(<SharedCourseImport />);
  const input = screen.getByLabelText('Share link or code to import');
  fireEvent.change(input, { target: { value: `LAC0${btoa(JSON.stringify(payload()))}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Read code' }));
  const add = await screen.findByRole('button', { name: 'Add to my courses' });
  expect(add).toBeEnabled();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(screen.getByText(/Reviews build up to your exam on/)).toBeInTheDocument();
  fireEvent.click(add);
  await waitFor(async () => expect(await db.courseAssessments.count()).toBe(1));
  expect((await db.courseAssessments.toArray())[0]).toMatchObject({
    schedulingMode: 'exam',
    examDate: learnerDate,
  });
});

it('starts a suggestion-free course with the onboarding choice', async () => {
  markOnboardingPending();
  chooseStudyTarget({ mode: 'steady' });
  const source = payload();
  source.course.sm = 1;
  delete source.course.e;
  render(<SharedCourseImport />);
  fireEvent.change(screen.getByLabelText('Share link or code to import'), {
    target: { value: `LAC0${btoa(JSON.stringify(source))}` },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read code' }));
  const add = await screen.findByRole('button', { name: 'Add to my courses' });
  expect(add).toBeEnabled();
  // Onboarding has just asked, so the picker is not repeated.
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  fireEvent.click(add);
  await waitFor(async () => expect(await db.courseAssessments.count()).toBe(1));
  expect((await db.courseAssessments.toArray())[0].schedulingMode).toBe('steady');
});

it('requires a choice for a code, including the keyboard shortcut, then confirms the suggestion', async () => {
  render(<SharedCourseImport />);
  const input = screen.getByLabelText('Share link or code to import');
  fireEvent.change(input, { target: { value: `LAC0${btoa(JSON.stringify(payload()))}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Read code' }));
  const add = await screen.findByRole('button', { name: 'Add to my courses' });
  expect(add).toBeDisabled();
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
  expect(await db.courses.count()).toBe(0);
  fireEvent.click(screen.getByRole('radio', { name: /Exam date/ }));
  expect(screen.getByLabelText('Exam instant')).toHaveValue(String(teacherDate));
  fireEvent.click(add);
  await waitFor(async () => expect(await db.courses.count()).toBe(1));
  expect((await db.courseAssessments.toArray())[0].examDate).toBe(teacherDate);
});

it('changes a file suggestion, refuses invalid input, and retains the choice on update', async () => {
  render(<SharedCourseImport />);
  fireEvent.change(screen.getByLabelText('Course file to import'), {
    target: { files: [courseFile(payload())] },
  });
  const add = await screen.findByRole('button', { name: 'Add to my courses' });
  fireEvent.click(screen.getByRole('radio', { name: /Exam date/ }));
  const date = screen.getByLabelText('Exam instant');
  fireEvent.change(date, { target: { value: 'invalid' } });
  expect(add).toBeDisabled();
  fireEvent.keyDown(date, { key: 'Enter', metaKey: true });
  expect(await db.courses.count()).toBe(0);
  fireEvent.change(date, { target: { value: String(learnerDate) } });
  fireEvent.click(add);
  await waitFor(async () => expect(await db.courses.count()).toBe(1));
  const course = (await db.courses.toArray())[0];
  expect((await db.courseAssessments.toArray())[0].examDate).toBe(learnerDate);
  const revised = payload();
  revised.rv = 2;
  revised.course.e = teacherDate + 10000;
  render(<SharedCourseImport initialFile={courseFile(revised)} />);
  await screen.findByRole('heading', { name: 'Course update' });
  expect(screen.queryByRole('radio', { name: /Exam date/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Update course' }));
  await waitFor(async () =>
    expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(2),
  );
  expect((await db.courseAssessments.toArray())[0].examDate).toBe(learnerDate);
});

it.each([true, false])(
  'chooses no fixed exam for an initial link file (teacher date present: %s)',
  async (dated) => {
    const source = payload();
    if (!dated) {
      delete source.course.e;
      source.course.sm = 1;
    }
    const onImported = vi.fn();
    render(<SharedCourseImport initialFile={courseFile(source)} onImported={onImported} />);
    const add = await screen.findByRole('button', { name: 'Add to my courses' });
    expect(add).toBeDisabled();
    expect(screen.getByText(/no fixed exam/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Steady retention/ }));
    fireEvent.click(add);
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    const courseId = onImported.mock.calls[0][0];
    expect((await db.courseAssessments.toArray())[0]).toMatchObject({ schedulingMode: 'steady' });
    expect((await db.courseAssessments.toArray())[0].examDate).toBeUndefined();
    const revised = payload();
    revised.rv = 2;
    await mergeLineageUpdate(courseId, revised);
    expect((await db.courseAssessments.toArray())[0].schedulingMode).toBe('steady');
    expect((await db.courseAssessments.toArray())[0].examDate).toBeUndefined();
  },
);

it('reports an invalid suggested time zone during inspection without importing', async () => {
  const source = payload();
  source.exams = [{ id: 'bad-final', n: 'Final', k: 'f', e: teacherDate, tz: 'Invalid/Zone' }];
  render(<SharedCourseImport initialFile={courseFile(source)} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid time zone');
  expect(screen.queryByRole('button', { name: 'Add to my courses' })).not.toBeInTheDocument();
  expect(await db.courses.count()).toBe(0);
});
