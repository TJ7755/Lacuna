import { useRef, type KeyboardEvent, type SyntheticEvent } from 'react';

interface DialogKeyOptions {
  onCancel: () => void;
  /** Runs on Ctrl/Cmd+Enter from anywhere, and on plain Enter when `enterSubmits` is set. */
  onSubmit?: () => void;
  /** Single-line forms: plain Enter in a text input also submits. Buttons keep their own Enter. */
  enterSubmits?: boolean;
  /** Return true to leave a key to a nested widget (for example a date picker popover). */
  ignore?: (target: Element, key: string) => boolean;
}

/**
 * The shared keyboard contract for dialogs and forms, as used by the card editor: Escape
 * cancels, Ctrl/Cmd+Enter submits, and single-line forms also submit on Enter. Tab is left
 * alone so the focus trap and explicit Tab targets keep working.
 */
export function dialogKeyDown({ onCancel, onSubmit, enterSubmits, ignore }: DialogKeyOptions) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Tab') return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    const target = event.target as Element;
    if (ignore?.(target, event.key)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Enter' && onSubmit) {
      const modified = event.ctrlKey || event.metaKey;
      const inTextInput = target instanceof HTMLInputElement && target.type === 'text';
      if (modified || (enterSubmits && inTextInput)) {
        event.preventDefault();
        onSubmit();
      }
    }
  };
}

/**
 * Keys for full-page and inline editors, as opposed to modal dialogs: it never stops
 * propagation, so the shell's own shortcuts keep working. Ctrl/Cmd+Enter submits unless a
 * field already used it (for example "add the next item"), and Escape cancels only while
 * nothing has been typed or clicked, so a stray Escape cannot discard work. Spread the result
 * onto the editor's root element.
 */
export function useEditorKeys({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit?: () => void;
}) {
  const dirty = useRef(false);
  const markDirty = (event: SyntheticEvent) => {
    if (event.type === 'input' || (event.target as Element).closest('button')) {
      dirty.current = true;
    }
  };
  return {
    onInput: markDirty,
    onClick: markDirty,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented) return;
      const target = event.target as Element;
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && onSubmit) {
        event.preventDefault();
        onSubmit();
      } else if (event.key === 'Escape' && !dirty.current && target.tagName !== 'SELECT') {
        event.preventDefault();
        onCancel();
      }
    },
  };
}
