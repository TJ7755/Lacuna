import type { KeyboardEvent } from 'react';
import type { QuestionSetAuthoringNode } from '../../questions/questionSetAuthoring';
import { hasChildren, isEmptyRow } from './composerEditing';

export type ComposerField = 'question' | 'scheme' | 'marks';
export function focusComposerField(
  root: HTMLElement | null,
  id: string,
  field: ComposerField = 'question',
) {
  const row = Array.from(root?.querySelectorAll<HTMLElement>('[data-composer-row]') ?? []).find(
    (element) => element.dataset.composerRow === id,
  );
  const input =
    row?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field="${field}"]`) ??
    row?.querySelector<HTMLTextAreaElement>('textarea');
  input?.focus({ preventScroll: true });
  if (input?.type !== 'number') input?.setSelectionRange(input.value.length, input.value.length);
  row?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
}

export function useComposerKeyboard(actions: {
  focus: (id: string, field?: ComposerField) => void;
  insert: (row: QuestionSetAuthoringNode) => void;
  indent: (row: QuestionSetAuthoringNode) => void;
  outdent: (row: QuestionSetAuthoringNode) => void;
  remove: (row: QuestionSetAuthoringNode) => void;
  move: (row: QuestionSetAuthoringNode, direction: number) => void;
}) {
  return (event: KeyboardEvent, row: QuestionSetAuthoringNode, firstChild?: string) => {
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    const target = event.target as HTMLElement;
    const field = target.dataset.field as ComposerField | undefined;
    if (!field || event.ctrlKey || event.metaKey) return;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      actions.move(row, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (event.key === 'Tab' && field === 'question' && isEmptyRow(row)) {
      event.preventDefault();
      (event.shiftKey ? actions.outdent : actions.indent)(row);
      return;
    }
    if (event.key === 'Backspace' && isEmptyRow(row)) {
      event.preventDefault();
      actions.remove(row);
      return;
    }
    if (event.key === 'Enter' && field === 'marks') {
      event.preventDefault();
      actions.insert(row);
      return;
    }
    if (event.key !== 'Tab') return;
    if (field === 'question' && !event.shiftKey) {
      event.preventDefault();
      actions.focus(
        hasChildren(row) && firstChild ? firstChild : row.id,
        hasChildren(row) ? 'question' : 'scheme',
      );
    } else if (field === 'scheme') {
      event.preventDefault();
      actions.focus(row.id, event.shiftKey ? 'question' : 'marks');
    } else if (field === 'marks' && event.shiftKey) {
      event.preventDefault();
      actions.focus(row.id, 'scheme');
    }
  };
}
