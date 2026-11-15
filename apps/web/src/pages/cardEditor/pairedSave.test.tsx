import 'fake-indexeddb/auto';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { reset } from '../../db/courseRepository.testFixtures';
import { createCourse } from '../../db/courseRepository';
import { createCard, createBasicReversedPair } from '../../db/cardRepository';
import { useCardEditorDraft } from './useCardEditorDraft';
import { useCardEditorSave } from './useCardEditorSave';
import { CardEditOverlay } from '../../components/cards/CardEditOverlay';

vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../../components/markdown/MarkdownEditor', () => ({
  MarkdownEditor: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <label>
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  ),
}));

const returnTo = {
  to: '/',
  label: 'Cards',
  goBack: vi.fn(),
  linkProps: { to: '/', onClick: vi.fn() },
};

beforeEach(async () => {
  await reset();
  localStorage.clear();
});

describe('editor paired saves through IndexedDB', () => {
  it('creates a reverse when the full editor converts an existing ordinary card', async () => {
    const course = await createCourse('Course');
    const card = await createCard(course.id, 'front_back', 'Question', 'Answer');
    const { result } = renderHook(() => {
      const draft = useCardEditorDraft({ currentDraftKey: 'pair-edit', editing: true, card });
      const save = useCardEditorSave({
        draft,
        course,
        card,
        courseId: course.id,
        lessonId: undefined,
        returnTo,
      });
      return { draft, save };
    });
    act(() => result.current.draft.changeType('basic_reversed'));
    await act(() => result.current.save.handleSave());
    const saved = (await db.cards.get(card.id))!;
    expect(saved.reverseCardId).toEqual(expect.any(String));
    expect(await db.cards.get(saved.reverseCardId!)).toMatchObject({
      front: 'Answer',
      back: 'Question',
      reverseCardId: card.id,
    });
  });

  it.each(['numeric', 'working', 'cloze'] as const)(
    'removes the obsolete reverse when the full editor converts a pair to %s',
    async (type) => {
      const course = await createCourse('Course');
      const { card, reverse } = await createBasicReversedPair(course.id, 'Question', 'Answer');
      const { result } = renderHook(() => {
        const draft = useCardEditorDraft({ currentDraftKey: 'pair-edit', editing: true, card });
        const save = useCardEditorSave({
          draft,
          course,
          card,
          courseId: course.id,
          lessonId: undefined,
          returnTo,
        });
        return { draft, save };
      });
      act(() => {
        result.current.draft.changeType(type);
        result.current.draft.setters.setFront('{{c1::4}}');
        result.current.draft.setters.setNumericAnswer({ kind: 'exact', value: '4' });
        result.current.draft.setters.setWorkingSource('[1] solve :: x = 4');
      });
      expect(result.current.save.canSave).toBe(true);
      await act(() => result.current.save.handleSave());
      expect(await db.cards.get(reverse.id)).toBeUndefined();
      expect(await db.cards.get(card.id)).toMatchObject({ reverseCardId: null, back: '' });
    },
  );

  it('saves reverse-side overlay edits to both rows and returns persisted linkage', async () => {
    const course = await createCourse('Course');
    const { card, reverse } = await createBasicReversedPair(course.id, 'Question', 'Answer');
    const onSaved = vi.fn();
    const view = render(<CardEditOverlay card={reverse} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.change(view.getByLabelText('Front'), { target: { value: 'Updated answer' } });
    fireEvent.click(view.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(await db.cards.get(card.id)).toMatchObject({
      front: 'Question',
      back: 'Updated answer',
    });
    expect(onSaved.mock.calls[0][0]).toEqual(await db.cards.get(reverse.id));
  });
});
