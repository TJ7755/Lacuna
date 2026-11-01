import type { KeyboardEvent, MouseEvent } from 'react';

/** Leave the browser's own menu wherever it edits or copies text. */
function wantsNativeMenu(target: EventTarget | null): boolean {
  if (window.getSelection()?.toString()) return true;
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
      null
  );
}

/** Reuse visible actions for context-menu gestures, preserving native editing menus. */
export function contextMenuHandlers(getOpen: () => (() => void) | null | undefined) {
  return {
    onContextMenu: (event: MouseEvent) => {
      const open = getOpen();
      if (!open || wantsNativeMenu(event.target)) return;
      event.preventDefault();
      open();
    },
    onKeyDown: (event: KeyboardEvent) => {
      const open = getOpen();
      if (!open || !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)))
        return;
      if (wantsNativeMenu(event.target)) return;
      event.preventDefault();
      open();
    },
  };
}
