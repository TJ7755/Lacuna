import {
  mockNavigate,
  updateCard,
  checkDuplicate,
  createCourseCard,
  course,
  generatedCard,
  sequence,
  occlusionCard,
  occlusion,
  renderEditing,
  renderNew,
  renderEditingViaLesson,
  chooseType,
  editorState,
} from './CardEditor.testSupport';
import { expectAppDestination } from '../../../../tests/helpers/expectAppDestination';
import { describe, expect, it, vi } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Card, Lesson } from '@lacuna/core/db/types';
import { FSRS_VERSION, defaultFsrsParameters } from '@lacuna/core/fsrs/params';

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

describe('CardEditor — backing-deck boundary', () => {
  it('uses the course-bank backing deck for duplicate checks', async () => {
    vi.useFakeTimers();
    editorState.bankBackingDeck = {
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
    editorState.bankBackingDeck = {
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

describe('CardEditor — generated cards', () => {
  it('renders a read-only preview instead of the form for a generated card', () => {
    editorState.card = generatedCard;
    editorState.sequences = [sequence];
    renderEditing();

    expect(screen.getByText(/generated from the sequence/i)).toBeInTheDocument();
    expect(screen.getByText(/“The alkali metals”/)).toBeInTheDocument();
    expect(screen.getByText('Sodium')).toBeInTheDocument();
    // No editable fields or save/delete actions.
    expect(screen.queryByPlaceholderText(/Question or prompt/)).not.toBeInTheDocument();
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
  });

  it('navigates to the owning sequence editor', () => {
    editorState.card = generatedCard;
    editorState.sequences = [sequence];
    renderEditing();

    fireEvent.click(screen.getByText('Edit sequence'));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/sequence/sequence-1/edit');
  });

  it('cancels back to the origin on Escape', () => {
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
    renderEditing();

    fireEvent.keyDown(screen.getByPlaceholderText(/Question or prompt/), { key: 'Escape' });
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/course/course-1'), {
      state: { returning: true },
    });
  });

  it('renders the ordinary editable form for a non-generated card', () => {
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
    renderEditing();

    expect(screen.getByPlaceholderText(/Question or prompt/)).toBeInTheDocument();
    expect(screen.getByText('Save changes')).toBeInTheDocument();
  });

  it('renders a read-only preview and links to the owning occlusion for an occlusion-generated card', () => {
    editorState.card = occlusionCard;
    editorState.occlusions = [occlusion];
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
    editorState.lesson = lesson;
    editorState.card = lessonCard;
    renderEditingViaLesson({ origin: { path: '/course/course-1/cards', label: 'Cards' } });

    const link = screen.getByRole('link', { name: 'Cards' });
    expectAppDestination(link, '/course/course-1/cards');
  });

  // A hard refresh drops router state — the lesson-scoped route itself still
  // carries enough information to fall back to the lesson correctly.
  it('falls back to the lesson encoded in the route when no origin state is present', () => {
    editorState.lesson = lesson;
    editorState.card = lessonCard;
    renderEditingViaLesson();

    const link = screen.getByRole('link', { name: 'Cells' });
    expectAppDestination(link, '/course/course-1/lesson/lesson-1');
  });

  // The Card-scoped edit route (Cards' Unassigned bucket) already has no
  // lesson to fall back to, so it targets the bank by default.
  it('falls back to the course bank when editing via the bank-scoped route', () => {
    editorState.card = { ...generatedCard, primaryLessonId: null, sequenceItemId: undefined };
    renderEditing();

    const link = screen.getByRole('link', { name: 'Cards' });
    expectAppDestination(link, '/course/course-1/cards');
  });
});

describe('CardEditor — published-course lock', () => {
  it.each([false, true])(
    'blocks saving a locked copy, including the keyboard shortcut (editing: %s)',
    async (editing) => {
      editorState.course = {
        ...course,
        distributedCopy: {
          lineageId: 'published-course',
          revision: 1,
          locked: true,
          autoAcceptUpdates: false,
        },
      };
      editorState.card = editing ? { ...generatedCard, sequenceItemId: undefined } : undefined;
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
    editorState.course = { ...course, lessonViewMode: 'study' };
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
    renderEditing();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(updateCard).toHaveBeenCalledWith('card-1', expect.any(Object));
  });
});
