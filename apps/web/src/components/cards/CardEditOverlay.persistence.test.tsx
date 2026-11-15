import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../../db/repository';
import * as repository from '../../db/cardRepository';
import { db } from '../../db/schema';
import { ToastProvider } from '../ui/Toast';
import { CardEditOverlay } from './CardEditOverlay';
import { draftKey, loadDraft } from '../../utils/drafts';

beforeEach(async () => {
  localStorage.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => vi.restoreAllMocks());

it.each(['unmount', 'pagehide'] as const)(
  'retains the latest edit on %s before autosave',
  async (exit) => {
    const course = await createCourse('Corrections');
    const card = await createCourseCard(course.id, 'front_back', 'Original question', 'Answer');
    const view = render(
      <ToastProvider>
        <CardEditOverlay card={card} draftScope="scope" onSaved={vi.fn()} onCancel={vi.fn()} />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Front' }), {
      target: { value: 'Latest edit' },
    });
    if (exit === 'unmount') view.unmount();
    else fireEvent(window, new Event('pagehide'));
    expect(loadDraft(draftKey('scope', `session:${card.id}`))).toMatchObject({
      front: 'Latest edit',
    });
  },
);

it('locks authoring and close actions during saving, then leaves no stale draft', async () => {
  const course = await createCourse('Corrections');
  const card = await createCourseCard(course.id, 'front_back', 'Original question', 'Answer');
  const original = repository.saveCardEdit;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(repository, 'saveCardEdit').mockImplementation(async (...args) => {
    await gate;
    return original(...args);
  });
  const cancel = vi.fn();
  const saved = vi.fn(() => view.unmount());
  const view = render(
    <ToastProvider>
      <CardEditOverlay card={card} draftScope="scope" onSaved={saved} onCancel={cancel} />
    </ToastProvider>,
  );
  const front = screen.getByRole('textbox', { name: 'Front' });
  fireEvent.change(front, { target: { value: 'Submitted edit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  try {
    expect(front).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Back' })).toBeDisabled();
    fireEvent.keyDown(front, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(cancel).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      release();
      await gate;
    });
  }
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect((await db.cards.get(card.id))?.front).toBe('Submitted edit');
  expect(loadDraft(draftKey('scope', `session:${card.id}`))).toBeNull();
});

it('keeps the editor open when a closing draft cannot be stored', async () => {
  const course = await createCourse('Corrections');
  const card = await createCourseCard(course.id, 'front_back', 'Original question', 'Answer');
  const cancel = vi.fn();
  render(
    <ToastProvider>
      <CardEditOverlay card={card} onSaved={vi.fn()} onCancel={cancel} />
    </ToastProvider>,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Front' }), {
    target: { value: 'Only copy' },
  });
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  expect(cancel).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Front' })).toHaveValue('Only copy');
  expect(screen.getByText(/Could not save your draft/)).toBeInTheDocument();
});
