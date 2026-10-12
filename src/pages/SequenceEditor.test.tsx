import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SequenceEditor } from './SequenceEditor';
import type { Course, Sequence } from '../db/types';
import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';

let mockCourse: Course | null | undefined;
let mockLesson: null | undefined;
let mockSequence: Sequence | null | undefined;
const createSequence = vi.fn().mockResolvedValue(undefined);
const updateSequence = vi.fn().mockResolvedValue(undefined);

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useLesson: () => mockLesson,
  useSequence: () => mockSequence,
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

vi.mock('../db/sequenceRepository', () => ({
  createSequence: (...args: unknown[]) => createSequence(...args),
  updateSequence: (...args: unknown[]) => updateSequence(...args),
  deleteSequence: vi.fn(),
  snapshotSequence: vi.fn().mockResolvedValue(null),
  restoreSequence: vi.fn(),
}));

const course: Course = {
  id: 'course-1',
  name: 'A-Level Economics',
  description: '',
  createdAt: Date.now(),
  updatedAt: 1,
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  fsrsVersion: 6,
  fsrsParameters: {
    requestRetention: 0.9,
    w: Array(21).fill(0),
    enable_fuzz: true,
    maximum_interval: 36500,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  },
  examObjective: 'expectedMarks',
  unlockMode: 'linear',
  autoPractice: false,
  practiceThresholdMinutesFar: 12,
  practiceThresholdMinutesNear: 6,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
};

function field(n: number) {
  return screen.getByLabelText(new RegExp(`^\\w+ ${n} content$`)) as HTMLTextAreaElement;
}

function type(n: number, value: string) {
  const input = field(n);
  fireEvent.input(input, { target: { value } });
  input.setSelectionRange(value.length, value.length);
}

function enter(n: number) {
  const input = field(n);
  input.setSelectionRange(input.value.length, input.value.length);
  fireEvent.keyDown(input, { key: 'Enter' });
}

function paste(n: number, text: string) {
  fireEvent.paste(field(n), { clipboardData: { getData: () => text } });
}

async function save(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
    await vi.waitFor(() => expect(createSequence).toHaveBeenCalled());
    await Promise.resolve(createSequence.mock.results[0]?.value);
  });
  await screen.findByText('Cards');
}

function renderNew(lessonMode = false) {
  return render(
    <MemoryRouter
      initialEntries={[
        lessonMode
          ? '/course/course-1/lesson/lesson-1/sequence/new'
          : '/course/course-1/sequence/new',
      ]}
    >
      <Routes>
        <Route path="/course/:courseId/sequence/new" element={<SequenceEditor />} />
        <Route
          path="/course/:courseId/lesson/:lessonId/sequence/new"
          element={<SequenceEditor />}
        />
        <Route path="/course/:courseId/cards" element={<p>Cards</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEdit(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/course/course-1/sequence/seq-1/edit', state }]}>
      <Routes>
        <Route path="/course/:courseId/sequence/:sequenceId/edit" element={<SequenceEditor />} />
        <Route path="/course/:courseId/cards" element={<p>Cards</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCourse = undefined;
  mockLesson = undefined;
  mockSequence = undefined;
  createSequence.mockClear();
  updateSequence.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

describe('SequenceEditor', () => {
  it.each(['course', 'lesson', 'sequence'] as const)(
    'keeps the missing-%s state aligned and its Back target full-size',
    (missing) => {
      mockCourse = missing === 'course' ? null : course;
      mockLesson = missing === 'lesson' ? null : undefined;
      mockSequence = missing === 'sequence' ? null : undefined;
      const { container } = missing === 'sequence' ? renderEdit() : renderNew(missing === 'lesson');
      expect(screen.getByText(`This ${missing} could not be found.`)).toBeInTheDocument();
      expect(container.firstElementChild).toHaveClass(...COURSE_PAGE_FRAME.split(' '));
      const back = screen.getByRole('link');
      expect(back).toHaveClass('min-h-11');
      expect(back).toHaveAttribute(
        'href',
        missing === 'course'
          ? '/'
          : missing === 'lesson'
            ? '/course/course-1'
            : '/course/course-1/cards',
      );
    },
  );
  it('aligns with course pages and offers one full-size destination-aware Back link', () => {
    mockCourse = course;
    const { container } = renderNew();
    expect(container.firstElementChild).toHaveClass(...COURSE_PAGE_FRAME.split(' '));
    const back = screen.getByRole('link', { name: 'Back to Cards' });
    expect(back).toHaveAttribute('href', '/course/course-1/cards');
    expect(back).toHaveClass('min-h-11');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
  it('keeps the editor header free of a repeated preset description', () => {
    mockCourse = course;
    const { container } = renderNew();
    expect(container.querySelector('header p')).toBeNull();
  });
  it('shows a skeleton while loading', () => {
    renderNew();
    expect(screen.queryByText('New sequence')).not.toBeInTheDocument();
  });

  it('starts with the name focused and one blank item to type into', () => {
    mockCourse = course;
    renderNew();
    expect(screen.getByRole('heading', { name: 'New sequence' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sequence name')).toHaveFocus();
    expect(screen.getByLabelText('Item 1 content')).toHaveValue('');
    expect(screen.queryByLabelText('Item 2 content')).not.toBeInTheDocument();
  });

  it('chooses the type with radios and shows its description once, beside the choice', () => {
    mockCourse = course;
    const { container } = renderNew();
    fireEvent.click(screen.getByRole('radio', { name: 'Poetry / verse' }));
    expect(screen.getByRole('radio', { name: 'Poetry / verse' })).toBeChecked();
    expect(screen.getByLabelText('Line 1 content')).toBeInTheDocument();
    expect(container.querySelector('header p')).toBeNull();
  });

  it('adds the next item with Enter, splitting at the caret', () => {
    mockCourse = course;
    renderNew();
    type(1, 'Glycolysis Krebs');
    const first = screen.getByLabelText('Item 1 content') as HTMLTextAreaElement;
    first.setSelectionRange(10, 10);
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(first).toHaveValue('Glycolysis');
    expect(screen.getByLabelText('Item 2 content')).toHaveValue('Krebs');
    expect(screen.getByLabelText('Item 2 content')).toHaveFocus();
  });

  it('keeps Shift+Enter inside the item', () => {
    mockCourse = course;
    renderNew();
    type(1, 'One');
    fireEvent.keyDown(screen.getByLabelText('Item 1 content'), { key: 'Enter', shiftKey: true });
    expect(screen.queryByLabelText('Item 2 content')).not.toBeInTheDocument();
  });

  it('starts a named section with Enter on an empty item, and Backspace removes it', () => {
    mockCourse = course;
    renderNew();
    fireEvent.click(screen.getByRole('radio', { name: 'Poetry / verse' }));
    type(1, 'Shall I compare thee');
    enter(1);
    enter(2);
    expect(screen.getByLabelText('Verse name')).toHaveValue('Verse 2');
    expect(screen.getByLabelText('Line 2 content')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('Line 2 content'), { key: 'Backspace' });
    expect(screen.queryByLabelText('Verse name')).not.toBeInTheDocument();
  });

  it('renames automatically named sections when the type changes, keeping chosen names', () => {
    mockCourse = course;
    renderNew();
    fireEvent.click(screen.getByRole('radio', { name: 'Poetry / verse' }));
    paste(1, 'One\n\nTwo\n\nThree');
    fireEvent.input(screen.getAllByLabelText('Verse name')[1], { target: { value: 'Coda' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Speech / presentation' }));
    expect(
      screen.getAllByLabelText('Section name').map((f) => (f as HTMLInputElement).value),
    ).toEqual(['Section 2', 'Coda']);
  });

  it('joins an item to the one above with Backspace at its start', () => {
    mockCourse = course;
    renderNew();
    type(1, 'Glyco');
    enter(1);
    type(2, 'lysis');
    const second = screen.getByLabelText('Item 2 content') as HTMLTextAreaElement;
    second.setSelectionRange(0, 0);
    fireEvent.keyDown(second, { key: 'Backspace' });
    expect(screen.getByLabelText('Item 1 content')).toHaveValue('Glycolysis');
    expect(screen.queryByLabelText('Item 2 content')).not.toBeInTheDocument();
  });

  it('reorders with Alt+arrow and moves between items with the arrows', () => {
    mockCourse = course;
    renderNew();
    type(1, 'B');
    enter(1);
    type(2, 'A');
    fireEvent.keyDown(screen.getByLabelText('Item 2 content'), { key: 'ArrowUp', altKey: true });
    expect(screen.getByLabelText('Item 1 content')).toHaveValue('A');
    expect(screen.getByLabelText('Item 1 content')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('Item 1 content'), { key: 'ArrowDown' });
    expect(screen.getByLabelText('Item 2 content')).toHaveFocus();
  });

  it('adds one item per pasted line, with blank lines starting sections', () => {
    mockCourse = course;
    renderNew();
    paste(1, 'Glycolysis\nLink reaction\n\nKrebs cycle');
    expect(screen.getByLabelText('Item 1 content')).toHaveValue('Glycolysis');
    expect(screen.getByLabelText('Item 2 content')).toHaveValue('Link reaction');
    expect(screen.getByLabelText('Item 3 content')).toHaveValue('Krebs cycle');
    expect(screen.getByLabelText('Chunk name')).toHaveValue('Chunk 2');
    expect(screen.getAllByText('3 cards')[0]).toBeInTheDocument();
  });

  it('drops empty items on save instead of blocking it', async () => {
    mockCourse = course;
    renderNew();
    fireEvent.change(screen.getByLabelText('Sequence name'), { target: { value: 'Respiration' } });
    paste(1, 'Glycolysis\nKrebs cycle');
    enter(2);
    expect(screen.getByLabelText('Item 3 content')).toHaveValue('');
    await save('Add sequence');
    expect(createSequence).toHaveBeenCalledWith(
      'course-1',
      null,
      'Respiration',
      [
        expect.objectContaining({ value: 'Glycolysis' }),
        expect.objectContaining({ value: 'Krebs cycle' }),
      ],
      expect.objectContaining({ mode: 'list', chunkLabels: undefined }),
    );
  });

  it('saves sections as chunk labels', async () => {
    mockCourse = course;
    renderNew();
    fireEvent.change(screen.getByLabelText('Sequence name'), { target: { value: 'Respiration' } });
    paste(1, 'Glycolysis\nLink\n\nKrebs\nChain');
    await save('Add sequence');
    const [, , , items, opts] = createSequence.mock.calls[0];
    expect(items.map((i: { chunkIndex?: number }) => i.chunkIndex)).toEqual([
      undefined,
      undefined,
      0,
      0,
    ]);
    expect(opts.chunkLabels).toEqual(['Chunk 2']);
  });

  it('explains why it cannot save rather than disabling the button', async () => {
    mockCourse = course;
    renderNew();
    const button = screen.getByRole('button', { name: 'Add sequence' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(screen.getByText('Enter a name before saving.')).toBeInTheDocument();
    expect(screen.getByLabelText('Sequence name')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Sequence name'), { target: { value: 'One' } });
    type(1, '   ');
    fireEvent.click(button);
    expect(screen.getByRole('alert')).toHaveTextContent('Add your first item to make cards.');
    expect(createSequence).not.toHaveBeenCalled();
  });

  it('saves with Ctrl+Enter from an item', async () => {
    mockCourse = course;
    renderNew();
    fireEvent.change(screen.getByLabelText('Sequence name'), { target: { value: 'Respiration' } });
    paste(1, 'Glycolysis\nKrebs cycle');
    await act(async () => {
      fireEvent.keyDown(field(2), { key: 'Enter', ctrlKey: true });
      await vi.waitFor(() => expect(createSequence).toHaveBeenCalled());
    });
    expect(screen.queryByLabelText('Item 3 content')).not.toBeInTheDocument();
  });

  it('cancels a pristine new sequence on Escape', async () => {
    mockCourse = course;
    renderNew();
    fireEvent.keyDown(screen.getByLabelText('Sequence name'), { key: 'Escape' });
    expect(await screen.findByText('Cards')).toBeInTheDocument();
  });

  it('keeps the editor open on Escape once something has been typed', () => {
    mockCourse = course;
    renderNew();
    type(1, 'Glycolysis');
    fireEvent.keyDown(screen.getByLabelText('Item 1 content'), { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'New sequence' })).toBeInTheDocument();
  });

  describe('scripts', () => {
    function startScript() {
      mockCourse = course;
      renderNew();
      fireEvent.click(screen.getByRole('radio', { name: 'Script / dialogue' }));
      fireEvent.change(screen.getByLabelText('Sequence name'), { target: { value: 'Scene one' } });
    }

    it('reads speakers from pasted lines and offers each as your part', () => {
      startScript();
      paste(1, 'ALICE: Who are you?\nBOB: Nobody.\nALICE: Indeed.');
      expect(screen.getByLabelText('Speaker for line 1')).toHaveValue('ALICE');
      expect(screen.getByLabelText('Line 2 content')).toHaveValue('Nobody.');
      expect(screen.getByRole('radio', { name: 'ALICE' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'BOB' })).toBeInTheDocument();
    });

    it('fills the speaker from a typed “NAME: line” on Enter', () => {
      startScript();
      type(1, 'ALICE: Who are you?');
      enter(1);
      expect(screen.getByLabelText('Speaker for line 1')).toHaveValue('ALICE');
      expect(screen.getByLabelText('Line 1 content')).toHaveValue('Who are you?');
    });

    it('asks for your part before saving, then saves it', async () => {
      startScript();
      paste(1, 'ALICE: Who are you?\nBOB: Nobody.');
      fireEvent.click(screen.getByRole('button', { name: 'Add sequence' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Choose your part before saving.');
      expect(screen.getByRole('radio', { name: 'ALICE' })).toHaveFocus();
      fireEvent.click(screen.getByRole('radio', { name: 'BOB' }));
      await save('Add sequence');
      expect(createSequence).toHaveBeenCalledWith(
        'course-1',
        null,
        'Scene one',
        [
          expect.objectContaining({ value: 'Who are you?', speaker: 'ALICE' }),
          expect.objectContaining({ value: 'Nobody.', speaker: 'BOB' }),
        ],
        expect.objectContaining({ mode: 'lines', presetId: 'script', mySpeaker: 'BOB' }),
      );
    });

    it('says when your part no longer has a line', () => {
      startScript();
      paste(1, 'ALICE: Who are you?\nBOB: Nobody.');
      fireEvent.click(screen.getByRole('radio', { name: 'ALICE' }));
      fireEvent.input(screen.getByLabelText('Speaker for line 1'), { target: { value: 'BOB' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add sequence' }));
      expect(screen.getByRole('alert')).toHaveTextContent('None of the lines are ALICE’s.');
    });

    it('drops speakers when switching to a type without them', async () => {
      startScript();
      paste(1, 'ALICE: Who are you?\nBOB: Nobody.');
      fireEvent.click(screen.getByRole('radio', { name: 'Poetry / verse' }));
      expect(screen.queryByLabelText('Speaker for line 1')).not.toBeInTheDocument();
      await save('Add sequence');
      const [, , , items, opts] = createSequence.mock.calls[0];
      expect(items[0]).not.toHaveProperty('speaker');
      expect(opts).toEqual(expect.objectContaining({ presetId: 'poetry', mySpeaker: undefined }));
    });
  });

  describe('return-to-origin back-link', () => {
    const editingSequence: Sequence = {
      id: 'seq-1',
      courseId: 'course-1',
      primaryLessonId: 'lesson-1',
      name: 'Scene one',
      items: [{ id: 'item-1', value: 'Indeed I am.' }],
      cueWindow: 2,
      createdAt: Date.now(),
      updatedAt: 1,
    };

    // Sequences have no lesson-scoped edit route, so the URL alone never signals a
    // lesson origin — the caller must pass it via router state (see LessonCardsSection).
    it('targets the lesson passed via router state when editing was opened from a lesson', () => {
      mockCourse = course;
      mockSequence = editingSequence;
      renderEdit({ origin: { path: '/course/course-1/lesson/lesson-1', label: 'Cells' } });

      const link = screen.getByRole('link', { name: 'Back to Cells' });
      expect(link).toHaveAttribute('href', '/course/course-1/lesson/lesson-1');
    });

    // A hard refresh drops router state entirely — the back-link must still land
    // somewhere sensible (the course bank) rather than erroring.
    it('falls back to the course bank when no origin state is present', () => {
      mockCourse = course;
      mockSequence = editingSequence;
      renderEdit();

      const link = screen.getByRole('link', { name: 'Back to Cards' });
      expect(link).toHaveAttribute('href', '/course/course-1/cards');
    });
  });
});
