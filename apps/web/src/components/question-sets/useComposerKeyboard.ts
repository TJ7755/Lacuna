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
  if (field === 'marks') input?.select();
  else input?.setSelectionRange(input.value.length, input.value.length);
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
  return (
    event: KeyboardEvent,
    row: QuestionSetAuthoringNode,
    nextRow?: QuestionSetAuthoringNode,
    previousRow?: QuestionSetAuthoringNode,
  ) => {
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    const field = target.dataset.field as ComposerField | undefined;
    if (!field || event.ctrlKey || event.metaKey) return;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      actions.move(row, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (
      event.key === 'Tab' &&
      field === 'question' &&
      isEmptyRow(row) &&
      (!event.shiftKey || row.depth > 0)
    ) {
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
    if (
      event.key === 'ArrowRight' &&
      !event.shiftKey &&
      !event.altKey &&
      field === 'scheme' &&
      target.selectionStart === target.value.length &&
      target.selectionEnd === target.value.length
    ) {
      event.preventDefault();
      actions.focus(row.id, 'marks');
      return;
    }
    if (
      event.key === 'ArrowLeft' &&
      !event.shiftKey &&
      !event.altKey &&
      field === 'marks' &&
      (!target.value || target.selectionStart === 0)
    ) {
      event.preventDefault();
      actions.focus(row.id, 'scheme');
      return;
    }
    if (event.key !== 'Tab') return;
    if (field === 'question' && !event.shiftKey) {
      event.preventDefault();
      actions.focus(
        hasChildren(row) && nextRow ? nextRow.id : row.id,
        hasChildren(row) ? 'question' : 'scheme',
      );
    } else if (field === 'question' && event.shiftKey && previousRow) {
      event.preventDefault();
      actions.focus(previousRow.id, hasChildren(previousRow) ? 'question' : 'scheme');
    } else if (field === 'scheme' || field === 'marks') {
      event.preventDefault();
      if (event.shiftKey) actions.focus(row.id, field === 'marks' ? 'scheme' : 'question');
      else if (nextRow) actions.focus(nextRow.id);
      else actions.insert(row);
    }
  };
}
