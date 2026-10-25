import { afterEach, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import type * as MotionReact from 'motion/react';
import type * as MarkdownEditorModule from '../components/markdown/MarkdownEditor';
import { CardEditor } from './CardEditor';
import type { Card, Course, LegacyDeckRecord, Lesson, Occlusion, Sequence } from '../db/types';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';

export const editorState = {
  present: true,
  realMarkdown: false,
  course: undefined as Course | undefined,
  card: undefined as Card | null | undefined,
  sequences: undefined as Sequence[] | undefined,
  occlusions: undefined as Occlusion[] | undefined,
  lesson: undefined as Lesson | null | undefined,
  bankBackingDeck: undefined as LegacyDeckRecord | undefined,
};

export const mockNavigate = vi.fn();

export const notify = vi.fn();

vi.mock('motion/react', async () => ({
  ...(await vi.importActual<typeof MotionReact>('motion/react')),
  useIsPresent: () => editorState.present,
}));

export const updateCard = vi.fn().mockResolvedValue(undefined);
export const checkDuplicate = vi.fn().mockResolvedValue(null);
export const createCourseCard = vi.fn().mockResolvedValue(undefined);
export const writeClipboardText = vi.fn().mockResolvedValue(undefined);

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
  useCard: () => editorState.card,
}));

vi.mock('../state/useCourseData', () => ({
  useCourse: () => editorState.course,
  useCourseCards: () => [],
  useLesson: () => editorState.lesson,
  useLessons: () => [],
  useLessonCards: () => (editorState.lesson ? [] : undefined),
  useLessonBackingDeck: () => undefined,
  useCourseBankBackingDeck: () => editorState.bankBackingDeck,
  useSequences: () => editorState.sequences,
  useOcclusions: () => editorState.occlusions,
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
  const actual = await vi.importActual<typeof MarkdownEditorModule>(
    '../components/markdown/MarkdownEditor',
  );
  return {
    MarkdownEditor: (props: React.ComponentProps<typeof actual.MarkdownEditor>) =>
      editorState.realMarkdown ? (
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

export const course: Course = {
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

export const generatedCard: Card = {
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

export const sequence: Sequence = {
  id: 'sequence-1',
  courseId: 'course-1',
  primaryLessonId: null,
  name: 'The alkali metals',
  items: [{ id: 'item-1', value: 'Sodium' }],
  cueWindow: 2,
  createdAt: Date.now(),
  updatedAt: 1,
};

export const occlusionCard: Card = {
  ...generatedCard,
  id: 'card-2',
  sequenceItemId: undefined,
  occlusionRegionId: 'region-1',
};

export const occlusion: Occlusion = {
  id: 'occlusion-1',
  courseId: 'course-1',
  primaryLessonId: null,
  name: 'The heart',
  assetHash: 'hash-1',
  regions: [{ id: 'region-1', role: 'label', shape: 'rectangle', x: 0, y: 0, w: 0.1, h: 0.1 }],
  createdAt: Date.now(),
  updatedAt: 1,
};

export function renderEditing() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1/cards/card-1/edit']}>
      <Routes>
        <Route path="/course/:courseId/cards/:cardId/edit" element={<CardEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

export function renderNew() {
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
export function renderEditingViaLesson(state?: unknown) {
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
export function chooseType(name: string) {
  const more = screen.queryByRole('button', { name: 'More card types' });
  if (more) fireEvent.click(more);
  fireEvent.click(screen.getByRole('button', { name }));
}

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  localStorage.clear();
  editorState.present = true;
  editorState.realMarkdown = false;
  notify.mockClear();
  editorState.course = course;
  editorState.card = undefined;
  editorState.sequences = [];
  editorState.occlusions = [];
  editorState.lesson = undefined;
  editorState.bankBackingDeck = undefined;
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
