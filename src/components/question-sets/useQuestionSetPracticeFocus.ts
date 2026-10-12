import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

/** Focus the active task after its writes settle, leaving ordinary edits alone. */
export function useQuestionSetPracticeFocus(
  root: RefObject<HTMLDivElement | null>,
  position: string,
  marking: boolean,
  complete: boolean,
  pending: boolean,
) {
  const focused = useRef('');
  const pendingFocus = useRef<Element | null | undefined>(undefined);
  useEffect(() => {
    if (pending) {
      if (pendingFocus.current === undefined) pendingFocus.current = document.activeElement;
      return;
    }
    const owner = pendingFocus.current;
    pendingFocus.current = undefined;
    if (focused.current === position) return;
    const current = document.activeElement;
    if (
      owner &&
      current !== owner &&
      current !== document.body &&
      current?.isConnected &&
      !current.closest('[inert]')
    ) {
      focused.current = position;
      return;
    }
    const selectors = complete
      ? ['[data-attempt-complete]']
      : marking
        ? ['.qs-paper .qs-choices input:checked']
        : ['.qs-paper textarea', '.qs-paper input:checked', '.qs-paper input'];
    const target = selectors
      .flatMap((selector) =>
        Array.from(root.current?.querySelectorAll<HTMLElement>(selector) ?? []),
      )
      .find((element) => !element.closest('[inert]'));
    if (!target) return;
    focused.current = position;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'nearest' });
  }, [root, position, marking, complete, pending]);
}

export function questionSetPrimaryKey(event: KeyboardEvent<HTMLDivElement>) {
  if (
    event.defaultPrevented ||
    event.nativeEvent.isComposing ||
    event.nativeEvent.keyCode === 229 ||
    event.repeat ||
    event.altKey ||
    event.key !== 'Enter' ||
    !(event.ctrlKey || event.metaKey) ||
    (event.target as HTMLElement).closest('[role="dialog"], [inert]')
  )
    return;
  const primary = event.currentTarget.querySelector<HTMLButtonElement>('[data-attempt-primary]');
  if (!primary) return;
  event.preventDefault();
  primary.click();
}
