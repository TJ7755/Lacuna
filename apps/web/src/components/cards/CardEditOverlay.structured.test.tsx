import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../../db/repository';
import { db } from '../../db/schema';
import { ToastProvider } from '../ui/Toast';
import { CardEditOverlay } from './CardEditOverlay';
import type { ItemPayload } from '@lacuna/core/db/types';

beforeEach(async () => {
  localStorage.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
});

it.each(['numeric', 'working'] as const)(
  'corrects a %s answer with an empty back and persists its payload',
  async (type) => {
    const course = await createCourse('Corrections');
    const payload: ItemPayload =
      type === 'numeric'
        ? { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } }
        : {
            v: 1,
            kind: 'working',
            scheme: [
              { marks: 1, label: 'answer', kind: 'predicate', predicate: 'equals', args: ['4'] },
            ],
          };
    const card = await createCourseCard(course.id, 'front_back', 'Solve 2x = 8', '', [], payload);
    const saved = vi.fn();
    render(
      <ToastProvider>
        <CardEditOverlay card={card} onSaved={saved} onCancel={vi.fn()} />
      </ToastProvider>,
    );
    const answer = screen.getByRole('textbox', {
      name: type === 'numeric' ? 'Expected answer' : 'Scheme source',
    });
    expect(answer).toHaveValue(type === 'numeric' ? '4' : '[1] answer :: equals :: 4');
    fireEvent.change(answer, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.change(answer, {
      target: { value: type === 'numeric' ? '5' : '[1] answer :: equals :: 5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    const expected: ItemPayload =
      type === 'numeric'
        ? { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '5' } }
        : {
            v: 1,
            kind: 'working',
            scheme: [
              { marks: 1, label: 'answer', kind: 'predicate', predicate: 'equals', args: ['5'] },
            ],
          };
    expect((await db.cards.get(card.id))?.payload).toEqual(expected);
    expect(saved.mock.calls[0][0]).toMatchObject({
      id: card.id,
      type: 'front_back',
      back: '',
      payload: expected,
    });
  },
);
