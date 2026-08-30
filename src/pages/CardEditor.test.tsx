import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { CardEditor } from './CardEditor';
import type { Card, Course, LegacyDeckRecord, Lesson, Occlusion, Sequence } from '../db/types';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { draftKey, loadDraft, saveDraft } from '../utils/drafts';

const mockNavigate = vi.fn();
let mockCourse: Course | undefined;
let mockCard: Card | null | undefined;
let mockSequences: Sequence[] | undefined;
let mockOcclusions: Occlusion[] | undefined;
let mockLesson: Lesson | null | undefined;
let mockBankBackingDeck: LegacyDeckRecord | undefined;
const updateCard = vi.fn().mockResolvedValue(undefined);
const checkDuplicate = vi.fn().mockResolvedValue(null);
const createCourseCard = vi.fn().mockResolvedValue(undefined);
const writeClipboardText = vi.fn().mockResolvedValue(undefined);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  function TestMemoryRouter(props: React.ComponentProps<typeof actual.MemoryRouter>) {
    return React.createElement(actual.MemoryRouter, {
      ...props,
      future: {
        ...props.future,
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      },
    });
  }
  return { ...actual, MemoryRouter: TestMemoryRouter, useNavigate: () => mockNavigate };
});

vi.mock('../state/useData', () => ({
  useCard: () => mockCard,
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useCourseCards: () => [],
  useLesson: () => mockLesson,
  useLessonCards: () => (mockLesson ? [] : undefined),
  useLessonBackingDeck: () => undefined,
  useCourseBankBackingDeck: () => mockBankBackingDeck,
  useSequences: () => mockSequences,
  useOcclusions: () => mockOcclusions,
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

vi.mock('../db/repository', () => ({
  checkDuplicate: (...args: unknown[]) => checkDuplicate(...args),
  createLessonCard: vi.fn(),
  createLessonCardWithReverse: vi.fn(),
  createLessonBasicReversedPair: vi.fn(),
  createCourseCard: (...args: unknown[]) => createCourseCard(...args),
  createCourseCardWithReverse: vi.fn(),
  createCourseBasicReversedPair: vi.fn(),
  updateCard: (...args: unknown[]) => updateCard(...args),
}));

// Stub the Markdown editor and viewer: fast, focuses the test on CardEditor's own
// wiring, mirroring SequenceEditor.test.tsx's MarkdownEditor stub.
vi.mock('../components/markdown/MarkdownEditor', () => ({
  MarkdownEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
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
  updatedAt: 1,
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
  conceptId: 'concept-card-1',
  deckId: 'deck-1',
  schedulingUnitId: 'deck-1',
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
  updatedAt: 1,
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
  updatedAt: 1,
};

const occlusionCard: Card = {
  ...generatedCard,
  id: 'card-2',
  sequenceItemId: undefined,
  occlusionRegionId: 'region-1',
};

const occlusion: Occlusion = {
  id: 'occlusion-1',
  courseId: 'course-1',
  primaryLessonId: null,
  name: 'The heart',
  assetHash: 'hash-1',
  regions: [{ id: 'region-1', role: 'label', shape: 'rectangle', x: 0, y: 0, w: 0.1, h: 0.1 }],
  createdAt: Date.now(),
  updatedAt: 1,
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

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1/cards/new']}>
      <Routes>
        <Route path="/course/:courseId/cards/new" element={<CardEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

// A lesson-owned card can be edited via the lesson-scoped route (so the editor's
// duplicate check and tag suggestions stay scoped to the lesson's own deck) while
// having been opened from elsewhere — e.g. Cards, via an origin override
// in router state (see src/utils/editorOrigin.ts).
function renderEditingViaLesson(state?: unknown) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/course/course-1/lesson/lesson-1/cards/card-1/edit', state }]}
    >
      <Routes>
        <Route
          path="/course/:courseId/lesson/:lessonId/cards/:cardId/edit"
          element={<CardEditor />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  localStorage.clear();
  mockCourse = course;
  mockCard = undefined;
  mockSequences = [];
  mockOcclusions = [];
  mockLesson = undefined;
  mockBankBackingDeck = undefined;
  mockNavigate.mockClear();
  updateCard.mockClear();
  checkDuplicate.mockClear();
  checkDuplicate.mockResolvedValue(null);
  createCourseCard.mockClear();
  writeClipboardText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writeClipboardText },
  });
});

describe('CardEditor — draft autosave', () => {
  it('does not fabricate a draft merely by opening a saved card', async () => {
    vi.useFakeTimers();
    mockCard = { ...generatedCard, sequenceItemId: undefined };
    renderEditing();

    await act(async () => {
      vi.advanceTimersByTime(801);
    });

    expect(loadDraft(draftKey('bank:course-1', 'card-1'))).toBeNull();
  });

  it('does not overwrite a saved draft while its restore prompt is unresolved', async () => {
    vi.useFakeTimers();
    mockCard = { ...generatedCard, sequenceItemId: undefined };
    const key = draftKey('bank:course-1', 'card-1');
    const savedDraft = {
      type: 'front_back' as const,
      front: 'Unsaved authoring work',
      back: 'Do not erase this',
      tags: ['important'],
      timestamp: 123,
    };
    saveDraft(key, savedDraft);

    renderEditing();
    expect(
      screen.getByText('A saved draft from a previous session was found.'),
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(801);
    });

    expect(loadDraft(key)).toEqual(savedDraft);
  });

  it('autosaves after the user changes the seeded card', async () => {
    vi.useFakeTimers();
    mockCard = { ...generatedCard, sequenceItemId: undefined };
    renderEditing();

    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Changed by the author' },
    });
    await act(async () => {
      vi.advanceTimersByTime(801);
    });

    expect(loadDraft(draftKey('bank:course-1', 'card-1'))?.front).toBe('Changed by the author');
  });

  it('does not treat a preview-only control as an authoring change', async () => {
    vi.useFakeTimers();
    mockCard = {
      ...generatedCard,
      sequenceItemId: undefined,
      type: 'cloze',
      front: 'Demand {{c1::falls}} when price rises.',
      back: '',
    };
    renderEditing();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Preview revealed answer' }));
    await act(async () => {
      vi.advanceTimersByTime(801);
    });

    expect(loadDraft(draftKey('bank:course-1', 'card-1'))).toBeNull();
  });

  it('uses the destination card draft after route-parameter navigation', async () => {
    const firstCard = { ...generatedCard, sequenceItemId: undefined };
    const secondCard = {
      ...firstCard,
      id: 'card-2',
      conceptId: 'concept-card-2',
      front: 'Persisted second card',
    };
    saveDraft(draftKey('bank:course-1', 'card-1'), {
      type: 'front_back',
      front: 'First card draft',
      back: 'First answer',
      tags: [],
      timestamp: 1,
    });
    saveDraft(draftKey('bank:course-1', 'card-2'), {
      type: 'front_back',
      front: 'Second card draft',
      back: 'Second answer',
      tags: [],
      timestamp: 2,
    });
    mockCard = firstCard;

    render(
      <MemoryRouter initialEntries={['/course/course-1/cards/card-1/edit']}>
        <Link to="/course/course-1/cards/card-2/edit">Open second card</Link>
        <Routes>
          <Route path="/course/:courseId/cards/:cardId/edit" element={<CardEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    mockCard = secondCard;
    fireEvent.click(screen.getByRole('link', { name: 'Open second card' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore draft' }));

    expect(screen.getByPlaceholderText(/Question or prompt/)).toHaveValue('Second card draft');
  });

  it('persists the source draft when navigating between cards before the debounce expires', async () => {
    const firstCard = { ...generatedCard, sequenceItemId: undefined };
    const secondCard = {
      ...firstCard,
      id: 'card-2',
      conceptId: 'concept-card-2',
      front: 'Persisted second card',
    };
    mockCard = firstCard;

    render(
      <MemoryRouter initialEntries={['/course/course-1/cards/card-1/edit']}>
        <Link to="/course/course-1/cards/card-2/edit">Open second card</Link>
        <Routes>
          <Route path="/course/:courseId/cards/:cardId/edit" element={<CardEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Unsaved source edit' },
    });
    mockCard = secondCard;
    // Navigate inside the 800 ms debounce window: the pending autosave timer must be
    // flushed into the source card's draft before the editor re-arms for card-2.
    fireEvent.click(screen.getByRole('link', { name: 'Open second card' }));
    await screen.findByDisplayValue('Persisted second card');

    expect(loadDraft(draftKey('bank:course-1', 'card-1'))?.front).toBe('Unsaved source edit');
    expect(loadDraft(draftKey('bank:course-1', 'card-2'))).toBeNull();
  });
});

describe('CardEditor — numeric items', () => {
  it('creates a numeric item with its answer in the structured payload', async () => {
    renderNew();
    fireEvent.click(screen.getByRole('button', { name: 'Numeric answer' }));
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'What is 8 / 2?' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Expected answer' }), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));

    await waitFor(() =>
      expect(createCourseCard).toHaveBeenCalledWith(
        'course-1',
        'front_back',
        'What is 8 / 2?',
        '',
        [],
        { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
      ),
    );
  });

  it('loads and updates an existing numeric item without exposing a Back field', async () => {
    mockCard = {
      ...generatedCard,
      sequenceItemId: undefined,
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
    };
    renderEditing();

    expect(screen.getByRole('button', { name: 'Numeric answer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByPlaceholderText(/Answer\. Markdown/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Expected answer' }), {
      target: { value: '8 / 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(updateCard).toHaveBeenCalledWith(
        'card-1',
        expect.objectContaining({
          type: 'front_back',
          back: '',
          payload: {
            v: 1,
            kind: 'numeric',
            answer: { kind: 'exact', value: '8 / 2' },
          },
        }),
      ),
    );
  });
});

describe('CardEditor — backing-deck boundary', () => {
  it('uses the course-bank backing deck for duplicate checks', async () => {
    vi.useFakeTimers();
    mockBankBackingDeck = {
      id: 'bank-deck',
      name: 'Cards',
      examDate: Date.now() + 86_400_000,
      timeZone: 'UTC',
      createdAt: Date.now(),
      fsrsVersion: FSRS_VERSION,
      fsrsParameters: defaultFsrsParameters(),
      examObjective: 'expectedMarks',
      lastInteractedAt: Date.now(),
    };
    renderNew();
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'What is demand?' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Answer. Markdown, maths and images are supported.'),
      {
        target: { value: 'The quantity consumers will buy.' },
      },
    );

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    expect(checkDuplicate).toHaveBeenCalledWith(
      'bank-deck',
      'front_back',
      'What is demand?',
      'The quantity consumers will buy.',
      undefined,
    );
  });

  it('describes a duplicate in current Course language', async () => {
    vi.useFakeTimers();
    mockBankBackingDeck = {
      id: 'bank-deck',
      name: 'Cards',
      examDate: Date.now() + 86_400_000,
      timeZone: 'UTC',
      createdAt: Date.now(),
      fsrsVersion: FSRS_VERSION,
      fsrsParameters: defaultFsrsParameters(),
      examObjective: 'expectedMarks',
      lastInteractedAt: Date.now(),
    };
    checkDuplicate.mockResolvedValue({ ...generatedCard, sequenceItemId: undefined });
    renderNew();
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'What is demand?' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Answer. Markdown, maths and images are supported.'),
      { target: { value: 'The quantity consumers will buy.' } },
    );

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(
      screen.getByText('A card with identical content already exists in this course.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/exists in this deck/i)).not.toBeInTheDocument();
  });
});

describe('CardEditor — working items', () => {
  it('copies a compiler-backed mark-scheme prompt for the current question', async () => {
    renderNew();
    fireEvent.click(screen.getByRole('button', { name: 'Working' }));
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Show that x = 4.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft mark scheme' }));

    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledOnce());
    const prompt = writeClipboardText.mock.calls[0][0] as string;
    expect(prompt).toContain('Show that x = 4.');
    expect(prompt).toContain('[1] answer :: equals :: 4');
    expect(prompt).toContain('Predicate vocabulary:');
  });

  it('creates a working item with the compiled scheme in its structured payload', async () => {
    renderNew();
    fireEvent.click(screen.getByRole('button', { name: 'Working' }));
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Show that x = 4.' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Scheme source' }), {
      target: { value: '[1] substitution :: 2x = 8\n[2] answer :: equals :: 4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));

    await waitFor(() =>
      expect(createCourseCard).toHaveBeenCalledWith(
        'course-1',
        'front_back',
        'Show that x = 4.',
        '',
        [],
        {
          v: 1,
          kind: 'working',
          scheme: [
            { marks: 1, label: 'substitution', kind: 'waypoint', expression: '2x = 8' },
            {
              marks: 2,
              label: 'answer',
              kind: 'predicate',
              predicate: 'equals',
              args: ['4'],
            },
          ],
        },
      ),
    );
  });

  it('does not save while any mark-scheme line is invalid', async () => {
    renderNew();
    fireEvent.click(screen.getByRole('button', { name: 'Working' }));
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Show your working.' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Scheme source' }), {
      target: { value: '[1] valid :: 4\nmissing marks' },
    });

    expect(screen.getByRole('button', { name: 'Add card' })).toBeDisabled();
    expect(createCourseCard).not.toHaveBeenCalled();
  });

  it('loads a persisted working scheme as editable source', () => {
    mockCard = {
      ...generatedCard,
      sequenceItemId: undefined,
      payload: {
        v: 1,
        kind: 'working',
        scheme: [{ marks: 1, label: 'answer', kind: 'waypoint', expression: 'x = 4' }],
      },
    };
    renderEditing();

    expect(screen.getByRole('button', { name: 'Working' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Scheme source' })).toHaveValue(
      '[1] answer :: x = 4',
    );
    expect(screen.queryByPlaceholderText(/Answer\. Markdown/)).not.toBeInTheDocument();
  });

  it('persists pinned working fixtures with the item', async () => {
    renderNew();
    fireEvent.click(screen.getByRole('button', { name: 'Working' }));
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Solve for x.' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Scheme source' }), {
      target: { value: '[1] answer :: equals :: 4' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Test student answer' }), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pin as fixture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    await waitFor(() =>
      expect(createCourseCard).toHaveBeenCalledWith(
        'course-1',
        'front_back',
        'Solve for x.',
        '',
        [],
        expect.objectContaining({
          kind: 'working',
          fixtures: [expect.objectContaining({ studentAnswer: ['4'], expectedMarks: 1 })],
        }),
      ),
    );
  });
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

  it('renders a read-only preview and links to the owning occlusion for an occlusion-generated card', () => {
    mockCard = occlusionCard;
    mockOcclusions = [occlusion];
    renderEditing();

    expect(screen.getByText(/generated from the occlusion/i)).toBeInTheDocument();
    expect(screen.getByText(/“The heart”/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Question or prompt/)).not.toBeInTheDocument();
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Edit occlusion'));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/occlusion/occlusion-1/edit');
  });
});

describe('CardEditor — return-to-origin back-link', () => {
  const lesson: Lesson = {
    id: 'lesson-1',
    courseId: 'course-1',
    name: 'Cells',
    description: '',
    orderIndex: 0,
    createdAt: Date.now(),
    updatedAt: 1,
    isExtension: false,
  };

  const lessonCard: Card = {
    ...generatedCard,
    id: 'card-1',
    primaryLessonId: 'lesson-1',
    sequenceItemId: undefined,
  };

  // Editing a lesson-owned card still uses the lesson-scoped route (so duplicate
  // checking and tag suggestions stay scoped to the lesson's deck), but when the
  // Cards opened it, an origin override sends the back-link there instead.
  it('targets Cards when an origin override is present', () => {
    mockLesson = lesson;
    mockCard = lessonCard;
    renderEditingViaLesson({ origin: { path: '/course/course-1/cards', label: 'Cards' } });

    const link = screen.getByRole('link', { name: 'Cards' });
    expect(link).toHaveAttribute('href', '/course/course-1/cards');
  });

  // A hard refresh drops router state — the lesson-scoped route itself still
  // carries enough information to fall back to the lesson correctly.
  it('falls back to the lesson encoded in the route when no origin state is present', () => {
    mockLesson = lesson;
    mockCard = lessonCard;
    renderEditingViaLesson();

    const link = screen.getByRole('link', { name: 'Cells' });
    expect(link).toHaveAttribute('href', '/course/course-1/lesson/lesson-1');
  });

  // The Card-scoped edit route (Cards' Unassigned bucket) already has no
  // lesson to fall back to, so it targets the bank by default.
  it('falls back to the course bank when editing via the bank-scoped route', () => {
    mockCard = { ...generatedCard, primaryLessonId: null, sequenceItemId: undefined };
    renderEditing();

    const link = screen.getByRole('link', { name: 'Cards' });
    expect(link).toHaveAttribute('href', '/course/course-1/cards');
  });
});
