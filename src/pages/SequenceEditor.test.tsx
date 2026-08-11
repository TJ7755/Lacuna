import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import type { Ref } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SequenceEditor } from './SequenceEditor';
import type { Course, Sequence } from '../db/types';

let mockCourse: Course | undefined;
let mockSequence: Sequence | null | undefined;
const createSequence = vi.fn().mockResolvedValue(undefined);
const updateSequence = vi.fn().mockResolvedValue(undefined);

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useLesson: () => undefined,
  useSequence: () => mockSequence,
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

vi.mock('../db/repository', () => ({
  createSequence: (...args: unknown[]) => createSequence(...args),
  updateSequence: (...args: unknown[]) => updateSequence(...args),
  deleteSequence: vi.fn(),
  snapshotSequence: vi.fn().mockResolvedValue(null),
  restoreSequence: vi.fn(),
}));

// Stub the Markdown editor: a plain textarea keeps the test fast and focused
// on SequenceEditor's own wiring, mirroring how QuestionBank.test.tsx stubs CardList.
vi.mock('../components/markdown/MarkdownEditor', () => ({
  MarkdownEditor: ({
    value,
    onChange,
    placeholder,
    inputRef,
    onModEnter,
    ariaLabel,
    ariaInvalid,
    ariaDescribedBy,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    inputRef?: Ref<HTMLTextAreaElement>;
    onModEnter?: () => void;
    ariaLabel?: string;
    ariaInvalid?: boolean;
    ariaDescribedBy?: string;
  }) => (
    <textarea
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (onModEnter && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          onModEnter();
        }
      }}
      aria-keyshortcuts={onModEnter ? 'Control+Enter Meta+Enter' : undefined}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid || undefined}
      aria-describedby={ariaDescribedBy}
      placeholder={placeholder}
    />
  ),
}));

const course: Course = {
  id: 'course-1',
  name: 'A-Level Economics',
  description: '',
  createdAt: Date.now(),
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

// The "Items (N)" label is split across a text node and a child <span>, so
// match on the combined textContent rather than an exact string.
function itemsHeading(count: number) {
  return screen.getByText((_content, element) => element?.textContent === `Items (${count})`);
}

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1/sequence/new']}>
      <Routes>
        <Route path="/course/:courseId/sequence/new" element={<SequenceEditor />} />
        <Route path="/course/:courseId/bank" element={<p>Bank</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEdit(state?: unknown) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/course/course-1/sequence/seq-1/edit', state }]}
    >
      <Routes>
        <Route path="/course/:courseId/sequence/:sequenceId/edit" element={<SequenceEditor />} />
        <Route path="/course/:courseId/bank" element={<p>Bank</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCourse = undefined;
  mockSequence = undefined;
  createSequence.mockClear();
  updateSequence.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

describe('SequenceEditor', () => {
  it('shows a skeleton while loading', () => {
    renderNew();
    expect(screen.queryByText('New sequence')).not.toBeInTheDocument();
  });

  it('renders a name field and one blank starting item', () => {
    mockCourse = course;
    renderNew();
    expect(screen.getByRole('heading', { name: 'New sequence' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. The Krebs cycle')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Sequence name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Sequence description' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Cue window' })).toBeInTheDocument();
    expect(itemsHeading(1)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Item 1 content' })).toBeInTheDocument();
  });

  it('updates the editor introduction when the preset changes', () => {
    mockCourse = course;
    renderNew();

    fireEvent.click(screen.getByRole('button', { name: /Script \/ dialogue/ }));
    expect(screen.getByRole('heading', { name: 'New sequence' }).nextElementSibling).toHaveTextContent(
      'A scripted scene — only your lines are recalled; other speakers cue them.',
    );
  });

  it('names chunk and item label fields', () => {
    mockCourse = course;
    renderNew();

    fireEvent.click(screen.getByRole('button', { name: 'Add chunk' }));
    expect(screen.getByRole('textbox', { name: 'Chunk 1' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Label for item 1' })).toBeInTheDocument();
  });

  it('adds an item beside the working position, focuses it and scrolls it into view', () => {
    mockCourse = course;
    renderNew();

    fireEvent.change(screen.getByRole('textbox', { name: 'Item 1 content' }), {
      target: { value: 'First' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add another item' }));
    expect(itemsHeading(2)).toBeInTheDocument();

    const values = screen.getAllByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    expect(values[1]).toHaveFocus();
    expect(values[1].scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
    expect(values[1]).toHaveAccessibleName('Item 2 content');
  });

  it('inserts below the selected row with an obvious per-row control', () => {
    mockCourse = course;
    renderNew();

    const first = screen.getByRole('textbox', { name: 'Item 1 content' });
    fireEvent.change(first, { target: { value: 'First' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add another item' }));
    let values = screen.getAllByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    fireEvent.change(values[1], { target: { value: 'Third' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add item below item 1' }));
    values = screen.getAllByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    expect(values).toHaveLength(3);
    expect(values[0]).toHaveValue('First');
    expect(values[1]).toHaveFocus();
    expect(values[2]).toHaveValue('Third');
  });

  it('adds and focuses consecutive items with Ctrl/Cmd+Enter from the value editor', () => {
    mockCourse = course;
    renderNew();

    const first = screen.getByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    expect(first).toHaveAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
    fireEvent.change(first, { target: { value: 'First' } });
    fireEvent.keyDown(first, { key: 'Enter', ctrlKey: true });

    let values = screen.getAllByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    expect(values).toHaveLength(2);
    expect(values[1]).toHaveFocus();
    fireEvent.change(values[1], { target: { value: 'Second' } });
    fireEvent.keyDown(values[1], { key: 'Enter', metaKey: true });

    values = screen.getAllByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    expect(values).toHaveLength(3);
    expect(values[0]).toHaveValue('First');
    expect(values[1]).toHaveValue('Second');
    expect(values[2]).toHaveFocus();
  });

  it('scopes the quick-entry shortcut to item content', () => {
    mockCourse = course;
    renderNew();

    fireEvent.keyDown(screen.getByPlaceholderText('e.g. The Krebs cycle'), {
      key: 'Enter',
      ctrlKey: true,
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Label (optional)'), {
      key: 'Enter',
      metaKey: true,
    });

    expect(itemsHeading(1)).toBeInTheDocument();
  });

  it('marks empty quick entry invalid and does not create blank chains', () => {
    mockCourse = course;
    renderNew();

    const first = screen.getByRole('textbox', { name: 'Item 1 content' });
    fireEvent.keyDown(first, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(first, { key: 'Enter', ctrlKey: true });

    expect(itemsHeading(1)).toBeInTheDocument();
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter item content before saving or adding another.',
    );

    fireEvent.change(first, { target: { value: 'Now valid' } });
    expect(first).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.keyDown(first, { key: 'Enter', metaKey: true });
    expect(itemsHeading(2)).toBeInTheDocument();
  });

  it('preserves reordering and deletion after quick entry', () => {
    mockCourse = course;
    renderNew();

    fireEvent.change(screen.getByRole('textbox', { name: 'Item 1 content' }), {
      target: { value: 'First' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add another item' }));
    const values = screen.getAllByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    fireEvent.change(values[1], { target: { value: 'Second' } });

    // Move the second item up so it becomes first.
    const moveUpButtons = screen.getAllByTitle('Move up');
    fireEvent.click(moveUpButtons[1]);

    const reordered = screen.getAllByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    expect(reordered[0]).toHaveValue('Second');
    expect(reordered[1]).toHaveValue('First');

    fireEvent.click(screen.getAllByTitle('Delete item')[1]);
    expect(itemsHeading(1)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Item content. Markdown, maths and images are supported.'),
    ).toHaveValue('Second');
  });

  it('shows a live preview count that grows as items are added', () => {
    mockCourse = course;
    renderNew();

    const values = screen.getAllByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    fireEvent.change(values[0], { target: { value: 'First item' } });
    expect(screen.getByText('1 card generated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add another item' }));
    const updatedValues = screen.getAllByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    fireEvent.change(updatedValues[1], { target: { value: 'Second item' } });
    expect(screen.getByText('2 cards generated')).toBeInTheDocument();
  });

  it('saves via createSequence and navigates back to the bank on Add sequence', async () => {
    mockCourse = course;
    renderNew();

    fireEvent.change(screen.getByPlaceholderText('e.g. The Krebs cycle'), {
      target: { value: 'My sequence' },
    });
    const values = screen.getAllByPlaceholderText(
      'Item content. Markdown, maths and images are supported.',
    );
    fireEvent.change(values[0], { target: { value: 'First item' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Add sequence'));
      await vi.waitFor(() => expect(createSequence).toHaveBeenCalled());
      await Promise.resolve(createSequence.mock.results[0]?.value);
    });
    await screen.findByText('Bank');
    expect(createSequence).toHaveBeenCalledWith(
      'course-1',
      null,
      'My sequence',
      expect.arrayContaining([expect.objectContaining({ value: 'First item' })]),
      expect.objectContaining({ cueWindow: 2, generateLabelCards: false, mode: 'list' }),
    );
  });

  it('shows inline validation instead of silently ignoring a blank sequence', () => {
    mockCourse = course;
    renderNew();

    fireEvent.click(screen.getByText('Add sequence'));

    expect(screen.getByRole('textbox', { name: 'Sequence name' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByText('Enter a sequence name before saving.')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')[1]).toHaveTextContent(
      'Enter item content before saving or adding another.',
    );
    expect(screen.getByRole('textbox', { name: 'Sequence name' })).toHaveFocus();
    expect(createSequence).not.toHaveBeenCalled();
  });

  describe('lines mode', () => {
    it('shows a speaker field per item and a "My speaker" picker once Script / dialogue is selected', () => {
      mockCourse = course;
      renderNew();

      expect(screen.queryByPlaceholderText('Speaker')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Script \/ dialogue/ }));

      expect(screen.getByPlaceholderText('Speaker')).toBeInTheDocument();
      expect(screen.getByText('My speaker')).toBeInTheDocument();
    });

    it('disables Add sequence until a speaker matching an item is chosen', () => {
      mockCourse = course;
      renderNew();
      fireEvent.click(screen.getByRole('button', { name: /Script \/ dialogue/ }));

      fireEvent.change(screen.getByPlaceholderText('e.g. The Krebs cycle'), {
        target: { value: 'Scene one' },
      });
      fireEvent.change(
        screen.getByPlaceholderText('Line content. Markdown, maths and images are supported.'),
        { target: { value: 'Indeed I am.' } },
      );
      fireEvent.change(screen.getByPlaceholderText('Speaker'), { target: { value: 'ALICE' } });

      expect(screen.getByText('Add sequence')).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/My speaker/), { target: { value: 'ALICE' } });
      expect(screen.getByText('Add sequence')).not.toBeDisabled();
    });

    it('saves with mode "lines" and the chosen mySpeaker', async () => {
      mockCourse = course;
      renderNew();
      fireEvent.click(screen.getByRole('button', { name: /Script \/ dialogue/ }));

      fireEvent.change(screen.getByPlaceholderText('e.g. The Krebs cycle'), {
        target: { value: 'Scene one' },
      });
      fireEvent.change(
        screen.getByPlaceholderText('Line content. Markdown, maths and images are supported.'),
        { target: { value: 'Indeed I am.' } },
      );
      fireEvent.change(screen.getByPlaceholderText('Speaker'), { target: { value: 'ALICE' } });
      fireEvent.change(screen.getByLabelText(/My speaker/), { target: { value: 'ALICE' } });

      await act(async () => {
        fireEvent.click(screen.getByText('Add sequence'));
        await vi.waitFor(() => expect(createSequence).toHaveBeenCalled());
        await Promise.resolve(createSequence.mock.results[0]?.value);
      });
      await screen.findByText('Bank');
      expect(createSequence).toHaveBeenCalledWith(
        'course-1',
        null,
        'Scene one',
        expect.arrayContaining([expect.objectContaining({ value: 'Indeed I am.', speaker: 'ALICE' })]),
        expect.objectContaining({ mode: 'lines', mySpeaker: 'ALICE' }),
      );
    });

    it.each([
      ['Poetry / verse', 'poetry'],
      ['Speech / presentation', 'speech'],
    ] as const)('clears hidden speaker metadata when switching from Script to %s', async (presetName, presetId) => {
      mockCourse = course;
      renderNew();
      fireEvent.click(screen.getByRole('button', { name: /Script \/ dialogue/ }));

      fireEvent.change(screen.getByPlaceholderText('e.g. The Krebs cycle'), {
        target: { value: 'Sonnet 18' },
      });
      fireEvent.change(
        screen.getByPlaceholderText('Line content. Markdown, maths and images are supported.'),
        { target: { value: 'Shall I compare thee to a summer’s day?' } },
      );
      fireEvent.change(screen.getByPlaceholderText('Speaker'), { target: { value: 'NARRATOR' } });
      fireEvent.change(screen.getByLabelText(/My speaker/), { target: { value: 'NARRATOR' } });

      fireEvent.click(screen.getByRole('button', { name: new RegExp(presetName.replace('/', '\\/')) }));

      expect(screen.queryByPlaceholderText('Speaker')).not.toBeInTheDocument();
      expect(screen.getByText('1 card generated')).toBeInTheDocument();
      expect(screen.getByText('Add sequence')).not.toBeDisabled();
      await act(async () => {
        fireEvent.click(screen.getByText('Add sequence'));
        await vi.waitFor(() => expect(createSequence).toHaveBeenCalled());
        await Promise.resolve(createSequence.mock.results[0]?.value);
      });
      await screen.findByText('Bank');
      expect(createSequence).toHaveBeenCalledWith(
        'course-1',
        null,
        'Sonnet 18',
        [expect.objectContaining({ value: 'Shall I compare thee to a summer’s day?' })],
        expect.objectContaining({ mode: 'lines', presetId, mySpeaker: undefined }),
      );
      expect(createSequence.mock.calls[0][3][0]).not.toHaveProperty('speaker');
    });

    it('disables saving when the selected speaker would generate no cards', () => {
      mockCourse = course;
      renderNew();
      fireEvent.click(screen.getByRole('button', { name: /Script \/ dialogue/ }));
      fireEvent.change(screen.getByPlaceholderText('e.g. The Krebs cycle'), {
        target: { value: 'Scene one' },
      });
      fireEvent.change(
        screen.getByPlaceholderText('Line content. Markdown, maths and images are supported.'),
        { target: { value: 'Indeed I am.' } },
      );
      fireEvent.change(screen.getByPlaceholderText('Speaker'), { target: { value: 'ALICE' } });
      fireEvent.change(screen.getByLabelText(/My speaker/), { target: { value: 'ALICE' } });
      fireEvent.change(screen.getByPlaceholderText('Speaker'), { target: { value: 'BOB' } });

      expect(screen.getByText('0 cards generated')).toBeInTheDocument();
      expect(screen.getByText('Add sequence')).toBeDisabled();
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
    };

    // Sequences have no lesson-scoped edit route, so the URL alone never signals a
    // lesson origin — the caller must pass it via router state (see LessonCardsSection).
    it('targets the lesson passed via router state when editing was opened from a lesson', () => {
      mockCourse = course;
      mockSequence = editingSequence;
      renderEdit({ origin: { path: '/course/course-1/lesson/lesson-1', label: 'Cells' } });

      const link = screen.getByRole('link', { name: 'Cells' });
      expect(link).toHaveAttribute('href', '/course/course-1/lesson/lesson-1');
    });

    // A hard refresh drops router state entirely — the back-link must still land
    // somewhere sensible (the course bank) rather than erroring.
    it('falls back to the course bank when no origin state is present', () => {
      mockCourse = course;
      mockSequence = editingSequence;
      renderEdit();

      const link = screen.getByRole('link', { name: 'Question bank' });
      expect(link).toHaveAttribute('href', '/course/course-1/bank');
    });
  });

  describe('re-pasting a script while editing', () => {
    const editingSequence: Sequence = {
      id: 'seq-1',
      courseId: 'course-1',
      primaryLessonId: null,
      name: 'Scene one',
      mode: 'lines',
      items: [{ id: 'item-1', value: 'Indeed I am.', speaker: 'ALICE' }],
      cueWindow: 2,
      mySpeaker: 'ALICE',
      createdAt: Date.now(),
    };

    it('warns before opening the paste modal when the sequence already has items, and cancelling keeps it closed', () => {
      mockCourse = course;
      mockSequence = editingSequence;
      renderEdit();

      fireEvent.click(screen.getByText('Paste script…'));

      const warning = screen.getByText(/reset study progress/i);
      expect(warning).toBeInTheDocument();
      expect(screen.queryByLabelText('Paste script')).not.toBeInTheDocument();

      fireEvent.click(warning.parentElement!.querySelector('button:last-of-type')!);
      expect(screen.getByText('Paste script…')).toBeInTheDocument();
    });

    it('opens the paste modal once the warning is confirmed', () => {
      mockCourse = course;
      mockSequence = editingSequence;
      renderEdit();

      fireEvent.click(screen.getByText('Paste script…'));
      fireEvent.click(screen.getByText('Replace'));

      expect(screen.getByLabelText('Paste script')).toBeInTheDocument();
    });
  });
});
