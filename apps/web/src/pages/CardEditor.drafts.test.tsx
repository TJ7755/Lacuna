import {
  mockNavigate,
  generatedCard,
  renderEditing,
  renderNew,
  chooseType,
  editorState,
} from './CardEditor.testSupport';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { CardEditor } from './CardEditor';
import { draftKey, loadDraft, saveDraft } from '../utils/drafts';

describe('CardEditor — draft autosave', () => {
  it('does not fabricate a draft merely by opening a saved card', async () => {
    vi.useFakeTimers();
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
    renderEditing();

    await act(async () => {
      vi.advanceTimersByTime(801);
    });

    expect(loadDraft(draftKey('bank:course-1', 'card-1'))).toBeNull();
  });

  it('does not overwrite a saved draft while its restore prompt is unresolved', async () => {
    vi.useFakeTimers();
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
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
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
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
    editorState.card = {
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
    editorState.card = firstCard;

    render(
      <MemoryRouter initialEntries={['/course/course-1/cards/card-1/edit']}>
        <Link to="/course/course-1/cards/card-2/edit">Open second card</Link>
        <Routes>
          <Route path="/course/:courseId/cards/:cardId/edit" element={<CardEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    editorState.card = secondCard;
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
    editorState.card = firstCard;

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
    editorState.card = secondCard;
    // Navigate inside the 800 ms debounce window: the pending autosave timer must be
    // flushed into the source card's draft before the editor re-arms for card-2.
    fireEvent.click(screen.getByRole('link', { name: 'Open second card' }));
    await screen.findByDisplayValue('Persisted second card');

    expect(loadDraft(draftKey('bank:course-1', 'card-1'))?.front).toBe('Unsaved source edit');
    expect(loadDraft(draftKey('bank:course-1', 'card-2'))).toBeNull();
  });
});
