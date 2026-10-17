import { expectAppDestination } from '../../tests/helpers/expectAppDestination';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import type * as MotionReact from 'motion/react';
import { CardEditor } from './CardEditor';
import type { Card, Course, LegacyDeckRecord, Lesson, Occlusion, Sequence } from '../db/types';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { draftKey, loadDraft, saveDraft } from '../utils/drafts';

const mockNavigate = vi.fn();
let mockIsPresent = true;
let mockRealMarkdown = false;
const notify = vi.fn();

vi.mock('motion/react', async () => ({
  ...(await vi.importActual<typeof MotionReact>('motion/react')),
  useIsPresent: () => mockIsPresent,
}));
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
  useLessons: () => [],
  useLessonCards: () => (mockLesson ? [] : undefined),
  useLessonBackingDeck: () => undefined,
  useCourseBankBackingDeck: () => mockBankBackingDeck,
  useSequences: () => mockSequences,
  useOcclusions: () => mockOcclusions,
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

vi.mock('../db/cardRepository', () => ({
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
vi.mock('../components/markdown/MarkdownEditor', async () => {
  const actual = await vi.importActual<typeof import('../components/markdown/MarkdownEditor')>(
    '../components/markdown/MarkdownEditor',
  );
  return {
    MarkdownEditor: (props: React.ComponentProps<typeof actual.MarkdownEditor>) =>
      mockRealMarkdown ? (
        <actual.MarkdownEditor {...props} />
      ) : (
        <textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
        />
      ),
  };
});

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

// The rarer types wait behind More until asked for.
function chooseType(name: string) {
  const more = screen.queryByRole('button', { name: 'More card types' });
  if (more) fireEvent.click(more);
  fireEvent.click(screen.getByRole('button', { name }));
}

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  localStorage.clear();
  mockIsPresent = true;
  mockRealMarkdown = false;
  notify.mockClear();
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
  createCourseCard.mockReset().mockResolvedValue(undefined);
  writeClipboardText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writeClipboardText },
  });
});

describe('CardEditor — import entry', () => {
  it('opens the existing import dialogue without expanding More and keeps the card draft', async () => {
    renderNew();
    const front = screen.getAllByRole('textbox')[0];
    fireEvent.change(front, { target: { value: 'Unsaved question' } });
    const more = screen.getByRole('button', { name: 'More card types' });
    const importButton = screen.getByRole('button', { name: 'Import cards' });
    expect(screen.getByRole('group', { name: 'Card type' })).not.toContainElement(importButton);
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(importButton);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close import' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(front).toHaveValue('Unsaved question');
    expect(more).toHaveAttribute('aria-expanded', 'false');
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

    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
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

  it('keeps typed content as a draft when another editor takes over', () => {
    renderNew();
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Unsaved prompt' },
    });
    chooseType('Sequence');

    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/sequence/new', {
      replace: true,
      state: null,
    });
    expect(loadDraft(draftKey('bank:course-1', 'new'))?.front).toBe('Unsaved prompt');
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

describe('CardEditor — live preview', () => {
  it('previews the question and flips to the answer', () => {
    renderNew();
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Why is the sky blue?' },
    });
    fireEvent.change(screen.getByPlaceholderText(/^Answer$/), {
      target: { value: 'Rayleigh scattering' },
    });

    const question = screen.getByRole('button', { name: 'Question' });
    const answer = screen.getByRole('button', { name: 'Answer' });
    expect(question).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('Why is the sky blue?').length).toBeGreaterThan(0);

    fireEvent.click(answer);
    expect(answer).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('Rayleigh scattering').length).toBeGreaterThan(0);
  });

  it('marks the chosen card type as pressed and hides the flip for structured items', () => {
    renderNew();
    expect(screen.getByRole('button', { name: 'Front / back' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    chooseType('Numeric answer');
    expect(screen.getByRole('button', { name: 'Numeric answer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('group', { name: 'Preview side' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Check a number or expression, for example: 8 / 2 = 4.'),
    ).toBeInTheDocument();
  });

  it('announces a save', async () => {
    renderNew();
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Q' },
    });
    fireEvent.change(screen.getByPlaceholderText(/^Answer$/), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }));

    expect(await screen.findByText(/^Saved$/, { selector: '[role="status"]' })).toBeInTheDocument();
  });
});

describe('CardEditor — numeric items', () => {
  it('creates a numeric item with its answer in the structured payload', async () => {
    renderNew();
    chooseType('Numeric answer');
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
        undefined,
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
    fireEvent.change(screen.getByPlaceholderText('Answer'), {
      target: { value: 'The quantity consumers will buy.' },
    });

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
    fireEvent.change(screen.getByPlaceholderText('Answer'), {
      target: { value: 'The quantity consumers will buy.' },
    });

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
    chooseType('Working');
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
    chooseType('Working');
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
        undefined,
      ),
    );
  });

  it('does not save while any mark-scheme line is invalid', async () => {
    renderNew();
    chooseType('Working');
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
    chooseType('Working');
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
        undefined,
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

  it('cancels back to the origin on Escape', () => {
    mockCard = { ...generatedCard, sequenceItemId: undefined };
    renderEditing();

    fireEvent.keyDown(screen.getByPlaceholderText(/Question or prompt/), { key: 'Escape' });
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/course/course-1'), {
      state: { returning: true },
    });
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
    expectAppDestination(link, '/course/course-1/cards');
  });

  // A hard refresh drops router state — the lesson-scoped route itself still
  // carries enough information to fall back to the lesson correctly.
  it('falls back to the lesson encoded in the route when no origin state is present', () => {
    mockLesson = lesson;
    mockCard = lessonCard;
    renderEditingViaLesson();

    const link = screen.getByRole('link', { name: 'Cells' });
    expectAppDestination(link, '/course/course-1/lesson/lesson-1');
  });

  // The Card-scoped edit route (Cards' Unassigned bucket) already has no
  // lesson to fall back to, so it targets the bank by default.
  it('falls back to the course bank when editing via the bank-scoped route', () => {
    mockCard = { ...generatedCard, primaryLessonId: null, sequenceItemId: undefined };
    renderEditing();

    const link = screen.getByRole('link', { name: 'Cards' });
    expectAppDestination(link, '/course/course-1/cards');
  });
});

describe('CardEditor — authored answer mode', () => {
  it('saves an explicit typing choice when creating a card', async () => {
    mockCourse = { ...course, lessonViewMode: 'edit' };
    renderNew();
    fireEvent.change(screen.getByRole('combobox', { name: 'Card answer mode' }), {
      target: { value: 'type' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'French for cat?' },
    });
    fireEvent.change(screen.getByPlaceholderText(/answer/i), { target: { value: 'chat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    await waitFor(() =>
      expect(createCourseCard).toHaveBeenCalledWith(
        'course-1',
        'front_back',
        'French for cat?',
        'chat',
        [],
        undefined,
        'type',
      ),
    );
  });

  it('loads an override and can return an existing card to the lesson default', async () => {
    mockCourse = { ...course, lessonViewMode: 'edit' };
    mockCard = { ...generatedCard, sequenceItemId: undefined, answerMode: 'type' };
    renderEditing();
    expect(screen.getByRole('combobox', { name: 'Card answer mode' })).toHaveValue('type');
    fireEvent.change(screen.getByRole('combobox', { name: 'Card answer mode' }), {
      target: { value: 'inherit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(updateCard).toHaveBeenCalledWith(
        mockCard!.id,
        expect.objectContaining({ answerMode: undefined }),
      ),
    );
  });
  it.each([false, true])(
    'ignores a restored answer-mode override in View mode (editing: %s)',
    async (editing) => {
      mockCourse = { ...course, lessonViewMode: 'study' };
      mockCard = editing
        ? { ...generatedCard, sequenceItemId: undefined, answerMode: 'reveal' }
        : undefined;
      saveDraft(draftKey('bank:course-1', editing ? 'card-1' : 'new'), {
        type: 'front_back',
        front: 'Draft question',
        back: 'Draft answer',
        tags: [],
        answerMode: 'type',
        timestamp: Date.now(),
      });
      if (editing) renderEditing();
      else renderNew();
      fireEvent.click(await screen.findByRole('button', { name: 'Restore draft' }));
      expect(screen.queryByRole('combobox', { name: 'Card answer mode' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: editing ? 'Save changes' : 'Add card' }));
      if (editing) {
        await waitFor(() =>
          expect(updateCard).toHaveBeenCalledWith(
            'card-1',
            expect.objectContaining({ answerMode: 'reveal' }),
          ),
        );
      } else {
        await waitFor(() =>
          expect(createCourseCard).toHaveBeenCalledWith(
            'course-1',
            'front_back',
            'Draft question',
            'Draft answer',
            [],
            undefined,
            undefined,
          ),
        );
      }
    },
  );

  it('preserves the saved answer mode if authoring is turned off while editing', async () => {
    mockCourse = { ...course, lessonViewMode: 'edit' };
    mockCard = { ...generatedCard, sequenceItemId: undefined, answerMode: 'reveal' };
    renderEditing();
    fireEvent.change(screen.getByRole('combobox', { name: 'Card answer mode' }), {
      target: { value: 'type' },
    });
    mockCourse = { ...course, lessonViewMode: 'study' };
    fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
      target: { value: 'Updated question' },
    });
    expect(screen.queryByRole('combobox', { name: 'Card answer mode' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(updateCard).toHaveBeenCalledWith(
        'card-1',
        expect.objectContaining({ answerMode: 'reveal' }),
      ),
    );
  });
});

describe('CardEditor — save navigation', () => {
  it.each([false, true])(
    'cancels the save return when the editor closes (editing: %s)',
    async (editing) => {
      vi.useFakeTimers();
      mockCard = editing ? { ...generatedCard, sequenceItemId: undefined } : undefined;
      const view = editing ? renderEditing() : renderNew();
      if (!editing) {
        fireEvent.change(screen.getByPlaceholderText(/Question or prompt/), {
          target: { value: 'Q' },
        });
        fireEvent.change(screen.getByPlaceholderText(/^Answer$/), { target: { value: 'A' } });
      }
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: editing ? 'Save changes' : 'Add card' }),
        );
      });
      expect(editing ? updateCard : createCourseCard).toHaveBeenCalledOnce();
      expect(mockNavigate).not.toHaveBeenCalled();
      view.unmount();
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    },
  );

  it('ignores a save that finishes after the editor has closed', async () => {
    vi.useFakeTimers();
    const save = Promise.withResolvers<void>();
    updateCard.mockReturnValueOnce(save.promise);
    mockCard = { ...generatedCard, sequenceItemId: undefined };
    const view = renderEditing();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    view.unmount();
    await act(async () => {
      save.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cancels the old return when navigating to another card in the same editor', async () => {
    vi.useFakeTimers();
    mockCard = { ...generatedCard, sequenceItemId: undefined };
    render(
      <MemoryRouter initialEntries={['/course/course-1/cards/card-1/edit']}>
        <Link to="/course/course-1/cards/card-2/edit">Next card</Link>
        <Routes>
          <Route path="/course/:courseId/cards/:cardId/edit" element={<CardEditor />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    mockCard = { ...generatedCard, id: 'card-2', sequenceItemId: undefined };
    fireEvent.click(screen.getByRole('link', { name: 'Next card' }));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cancels the return while the editor is retained for its exit animation', async () => {
    vi.useFakeTimers();
    mockCard = { ...generatedCard, sequenceItemId: undefined };
    const view = renderEditing();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    mockIsPresent = false;
    view.rerender(
      <MemoryRouter initialEntries={['/course/course-1/cards/card-1/edit']}>
        <Routes>
          <Route path="/course/:courseId/cards/:cardId/edit" element={<CardEditor />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns after the confirmation when the editor remains open', async () => {
    vi.useFakeTimers();
    mockCard = { ...generatedCard, sequenceItemId: undefined };
    renderEditing();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(mockNavigate).toHaveBeenCalledExactlyOnceWith('/course/course-1/cards', {
      state: { returning: true },
    });
  });
});

describe('CardEditor — saved-card return', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCard = { ...generatedCard, sequenceItemId: undefined };
  });

  it('returns to Cards after save feedback when the editor stays present', async () => {
    renderEditing();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/cards', {
      state: { returning: true },
    });
  });

  it('cancels the pending return when the editor unmounts', async () => {
    const view = renderEditing();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    view.unmount();
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cancels the return as the route starts exiting, before unmount', async () => {
    const view = renderEditing();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    mockIsPresent = false;
    view.rerender(
      <MemoryRouter initialEntries={['/course/course-1/cards/card-1/edit']}>
        <Routes>
          <Route path="/course/:courseId/cards/:cardId/edit" element={<CardEditor />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cancels the return when another card opens in the same editor', async () => {
    render(
      <MemoryRouter initialEntries={['/course/course-1/cards/card-1/edit']}>
        <Link to="/course/course-1/cards/card-2/edit">Open second card</Link>
        <Routes>
          <Route path="/course/:courseId/cards/:cardId/edit" element={<CardEditor />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    mockCard = { ...generatedCard, id: 'card-2', sequenceItemId: undefined };
    fireEvent.click(screen.getByRole('link', { name: 'Open second card' }));
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not schedule a return when saving finishes after unmount', async () => {
    let finishSave!: () => void;
    updateCard.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const view = renderEditing();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    view.unmount();
    await act(async () => {
      finishSave();
    });
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('CardEditor — published-course lock', () => {
  it.each([false, true])(
    'blocks saving a locked copy, including the keyboard shortcut (editing: %s)',
    async (editing) => {
      mockCourse = {
        ...course,
        distributedCopy: {
          lineageId: 'published-course',
          revision: 1,
          locked: true,
          autoAcceptUpdates: false,
        },
      };
      mockCard = editing ? { ...generatedCard, sequenceItemId: undefined } : undefined;
      if (editing) renderEditing();
      else renderNew();
      const fields = screen.getAllByRole('textbox');
      fireEvent.change(fields[0], { target: { value: 'Changed question' } });
      fireEvent.change(fields[1], { target: { value: 'Changed answer' } });
      expect(
        screen.getByRole('button', { name: editing ? 'Save changes' : 'Add card' }),
      ).toBeDisabled();
      await act(async () => {
        fireEvent.keyDown(fields[0], { key: 'Enter', ctrlKey: true });
      });
      expect(updateCard).not.toHaveBeenCalled();
      expect(createCourseCard).not.toHaveBeenCalled();
    },
  );

  it('keeps ordinary Study-mode cards editable', async () => {
    mockCourse = { ...course, lessonViewMode: 'study' };
    mockCard = { ...generatedCard, sequenceItemId: undefined };
    renderEditing();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(updateCard).toHaveBeenCalledWith('card-1', expect.any(Object));
  });
});

describe('CardEditor — real specialised authoring controls', () => {
  beforeEach(() => {
    mockRealMarkdown = true;
  });

  function fillNumeric() {
    renderNew();
    chooseType('Numeric answer');
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), {
      target: { value: '2 + 2?' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Expected answer' }), {
      target: { value: '4' },
    });
  }

  it('blocks repeated keyboard and pointer saves during a pending write', async () => {
    let complete!: () => void;
    createCourseCard.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    fillNumeric();
    const answer = screen.getByRole('textbox', { name: 'Expected answer' });
    fireEvent.keyDown(answer, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(answer, { key: 'Enter', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }));
    expect(createCourseCard).toHaveBeenCalledTimes(1);
    await act(async () => complete());
    expect(screen.getByText('1 added', { exact: true })).toBeInTheDocument();
  });

  it('retains a failed numeric save, explains it and allows retry', async () => {
    createCourseCard.mockRejectedValueOnce(new Error('Disk full'));
    fillNumeric();
    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Could not save the card. Try again.', 'negative'),
    );
    expect(screen.getByRole('textbox', { name: 'Expected answer' })).toHaveValue('4');
    expect(screen.getByRole('textbox', { name: 'Question' })).toHaveValue('2 + 2?');
    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }));
    await screen.findByText('1 added', { exact: true });
    expect(createCourseCard).toHaveBeenCalledTimes(2);
  });

  it('focuses and explains the first invalid field on a save shortcut', async () => {
    renderNew();
    chooseType('Numeric answer');
    let prompt = screen.getByRole('textbox', { name: 'Question' });
    fireEvent.keyDown(prompt, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Question' })).toHaveFocus());
    expect(notify).toHaveBeenLastCalledWith('Enter a question or prompt.', 'negative');
    prompt = screen.getByRole('textbox', { name: 'Question' });
    fireEvent.change(prompt, { target: { value: '2 + 2?' } });
    fireEvent.keyDown(prompt, { key: 'Enter', ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Expected answer' })).toHaveFocus(),
    );
    expect(notify).toHaveBeenLastCalledWith(
      'Enter at least one valid numeric answer without variables.',
      'negative',
    );
    expect(createCourseCard).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });
    expect(screen.getByRole('textbox', { name: 'Expected answer' })).toHaveFocus();
  });

  it('leaves composing mark-scheme suggestion keys to the input method', () => {
    renderNew();
    chooseType('Working');
    const source = screen.getByRole('textbox', { name: 'Scheme source' });
    fireEvent.change(source, { target: { value: '[', selectionStart: 1 } });
    fireEvent.keyDown(source, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(source).toHaveValue('[');
    fireEvent.keyDown(source, { key: 'Tab', keyCode: 229 });
    expect(source).toHaveValue('[');
    fireEvent.keyDown(source, { key: 'Enter', ctrlKey: true });
    expect(source).toHaveValue('[1] ');
    expect(createCourseCard).not.toHaveBeenCalled();
  });
});
