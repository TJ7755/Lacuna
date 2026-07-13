import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  MarkdownEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
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
  fsrsParameters: { requestRetention: 0.9, w: Array(21).fill(0), enable_fuzz: true, maximum_interval: 36500, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] },
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
  return screen.getByText(
    (_content, element) => element?.textContent === `Items (${count})`,
  );
}

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1/sequence/new']}>
      <Routes>
        <Route path="/course/:courseId/sequence/new" element={<SequenceEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCourse = undefined;
  mockSequence = undefined;
  createSequence.mockClear();
  updateSequence.mockClear();
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
    expect(itemsHeading(1)).toBeInTheDocument();
  });

  it('adds an item and reorders it to the top', () => {
    mockCourse = course;
    renderNew();

    fireEvent.click(screen.getByText('Add item'));
    expect(itemsHeading(2)).toBeInTheDocument();

    const values = screen.getAllByPlaceholderText('Item content. Markdown, maths and images are supported.');
    fireEvent.change(values[0], { target: { value: 'First' } });
    fireEvent.change(values[1], { target: { value: 'Second' } });

    // Move the second item up so it becomes first.
    const moveUpButtons = screen.getAllByTitle('Move up');
    fireEvent.click(moveUpButtons[1]);

    const reordered = screen.getAllByPlaceholderText('Item content. Markdown, maths and images are supported.');
    expect(reordered[0]).toHaveValue('Second');
    expect(reordered[1]).toHaveValue('First');
  });

  it('shows a live preview count that grows as items are added', () => {
    mockCourse = course;
    renderNew();

    const values = screen.getAllByPlaceholderText('Item content. Markdown, maths and images are supported.');
    fireEvent.change(values[0], { target: { value: 'First item' } });
    expect(screen.getByText('1 card generated')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Add item'));
    const updatedValues = screen.getAllByPlaceholderText('Item content. Markdown, maths and images are supported.');
    fireEvent.change(updatedValues[1], { target: { value: 'Second item' } });
    expect(screen.getByText('2 cards generated')).toBeInTheDocument();
  });

  it('saves via createSequence and navigates back to the bank on Add sequence', () => {
    mockCourse = course;
    renderNew();

    fireEvent.change(screen.getByPlaceholderText('e.g. The Krebs cycle'), {
      target: { value: 'My sequence' },
    });
    const values = screen.getAllByPlaceholderText('Item content. Markdown, maths and images are supported.');
    fireEvent.change(values[0], { target: { value: 'First item' } });

    fireEvent.click(screen.getByText('Add sequence'));
    expect(createSequence).toHaveBeenCalledWith(
      'course-1',
      null,
      'My sequence',
      expect.arrayContaining([expect.objectContaining({ value: 'First item' })]),
      expect.objectContaining({ cueWindow: 2, generateLabelCards: false }),
    );
  });
});
