import {
  mockNavigate,
  updateCard,
  createCourseCard,
  course,
  generatedCard,
  renderEditing,
  renderNew,
  editorState,
} from './CardEditor.testSupport';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { CardEditor } from './CardEditor';
import { draftKey, saveDraft } from '../utils/drafts';

describe('CardEditor — authored answer mode', () => {
  it('saves an explicit typing choice when creating a card', async () => {
    editorState.course = { ...course, lessonViewMode: 'edit' };
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
    editorState.course = { ...course, lessonViewMode: 'edit' };
    editorState.card = { ...generatedCard, sequenceItemId: undefined, answerMode: 'type' };
    renderEditing();
    expect(screen.getByRole('combobox', { name: 'Card answer mode' })).toHaveValue('type');
    fireEvent.change(screen.getByRole('combobox', { name: 'Card answer mode' }), {
      target: { value: 'inherit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(updateCard).toHaveBeenCalledWith(
        editorState.card!.id,
        expect.objectContaining({ answerMode: undefined }),
      ),
    );
  });
  it.each([false, true])(
    'ignores a restored answer-mode override in View mode (editing: %s)',
    async (editing) => {
      editorState.course = { ...course, lessonViewMode: 'study' };
      editorState.card = editing
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
    editorState.course = { ...course, lessonViewMode: 'edit' };
    editorState.card = { ...generatedCard, sequenceItemId: undefined, answerMode: 'reveal' };
    renderEditing();
    fireEvent.change(screen.getByRole('combobox', { name: 'Card answer mode' }), {
      target: { value: 'type' },
    });
    editorState.course = { ...course, lessonViewMode: 'study' };
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
      editorState.card = editing ? { ...generatedCard, sequenceItemId: undefined } : undefined;
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
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
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
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
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
    editorState.card = { ...generatedCard, id: 'card-2', sequenceItemId: undefined };
    fireEvent.click(screen.getByRole('link', { name: 'Next card' }));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cancels the return while the editor is retained for its exit animation', async () => {
    vi.useFakeTimers();
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
    const view = renderEditing();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    editorState.present = false;
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
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
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
    editorState.card = { ...generatedCard, sequenceItemId: undefined };
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
    editorState.present = false;
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
    editorState.card = { ...generatedCard, id: 'card-2', sequenceItemId: undefined };
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
