import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { CardEditor } from './CardEditor';
import type { Card, Course, Sequence } from '../db/types';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';

const mockNavigate = vi.fn();
let mockCourse: Course | undefined;
let mockCard: Card | null | undefined;
let mockSequences: Sequence[] | undefined;
const updateCard = vi.fn().mockResolvedValue(undefined);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../state/useData', () => ({
  useCard: () => mockCard,
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useCourseCards: () => [],
  useLesson: () => undefined,
  useLessonCards: () => undefined,
  useSequences: () => mockSequences,
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

vi.mock('../db/repository', () => ({
  checkDuplicate: vi.fn().mockResolvedValue(null),
  createLessonCard: vi.fn(),
  createLessonCardWithReverse: vi.fn(),
  createLessonBasicReversedPair: vi.fn(),
  createCourseCard: vi.fn(),
  createCourseCardWithReverse: vi.fn(),
  createCourseBasicReversedPair: vi.fn(),
  updateCard: (...args: unknown[]) => updateCard(...args),
}));

// Stub the Markdown editor and viewer: fast, focuses the test on CardEditor's own
// wiring, mirroring SequenceEditor.test.tsx's MarkdownEditor stub.
vi.mock('../components/markdown/MarkdownEditor', () => ({
  MarkdownEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  ),
}));

vi.mock('../components/markdown/MarkdownView', () => ({
  MarkdownView: ({ source }: { source: string }) => <div data-testid="markdown-view">{source}</div>,
}));

const course: Course = {
  id: 'course-1',
  name: 'A-Level Economics',
  description: '',
  createdAt: Date.now(),
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  fsrsVersion: FSRS_VERSION,
  fsrsParameters: defaultFsrsParameters(),
  examObjective: 'expectedMarks',
  unlockMode: 'linear',
  autoPractice: false,
  practiceThresholdMinutesFar: 12,
  practiceThresholdMinutesNear: 6,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
};

const generatedCard: Card = {
  id: 'card-1',
  deckId: 'deck-1',
  courseId: 'course-1',
  primaryLessonId: null,
  type: 'front_back',
  front: '**A sequence**\n\nFirst item?',
  back: 'Sodium',
  stability: null,
  difficulty: null,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  state: 0,
  due: null,
  scheduledDays: 0,
  learningSteps: 0,
  history: [],
  createdAt: Date.now(),
  sequenceItemId: 'item-1',
};

const sequence: Sequence = {
  id: 'sequence-1',
  courseId: 'course-1',
  primaryLessonId: null,
  name: 'The alkali metals',
  items: [{ id: 'item-1', value: 'Sodium' }],
  cueWindow: 2,
  createdAt: Date.now(),
};

function renderEditing() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1/cards/card-1/edit']}>
      <Routes>
        <Route path="/course/:courseId/cards/:cardId/edit" element={<CardEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCourse = course;
  mockCard = undefined;
  mockSequences = [];
  mockNavigate.mockClear();
  updateCard.mockClear();
});

describe('CardEditor — generated cards', () => {
  it('renders a read-only preview instead of the form for a generated card', () => {
    mockCard = generatedCard;
    mockSequences = [sequence];
    renderEditing();

    expect(screen.getByText(/generated from the sequence/i)).toBeInTheDocument();
    expect(screen.getByText(/“The alkali metals”/)).toBeInTheDocument();
    expect(screen.getByText('Sodium')).toBeInTheDocument();
    // No editable fields or save/delete actions.
    expect(screen.queryByPlaceholderText(/Question or prompt/)).not.toBeInTheDocument();
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
  });

  it('navigates to the owning sequence editor', () => {
    mockCard = generatedCard;
    mockSequences = [sequence];
    renderEditing();

    fireEvent.click(screen.getByText('Edit sequence'));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/sequence/sequence-1/edit');
  });

  it('renders the ordinary editable form for a non-generated card', () => {
    mockCard = { ...generatedCard, sequenceItemId: undefined };
    renderEditing();

    expect(screen.getByPlaceholderText(/Question or prompt/)).toBeInTheDocument();
    expect(screen.getByText('Save changes')).toBeInTheDocument();
  });
});
