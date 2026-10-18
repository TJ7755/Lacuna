import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';

/** The submission trigger is replaced only after flushing, so retain its focus ownership first. */
export function useQuestionSetBlankConfirmation(root: RefObject<HTMLDivElement | null>) {
  const [open, setOpen] = useState(false);
  const [focusOnMount, setFocusOnMount] = useState<'cancel' | undefined>();
  const ref = useRef<HTMLDivElement>(null);
  const owner = useRef<Element | null>(null);
  const returning = useRef<Element | null>(null);
  useLayoutEffect(() => {
    if (open || !returning.current) return;
    const previous = returning.current;
    returning.current = null;
    const current = document.activeElement;
    if (current !== previous && current !== document.body && current?.isConnected) return;
    const trigger = root.current?.querySelector<HTMLButtonElement>('[data-attempt-submit]');
    if (trigger && !trigger.disabled && !trigger.closest('[inert]')) trigger.focus();
  }, [open, root]);
  return {
    open,
    ref,
    focusOnMount,
    prepare() {
      owner.current = document.activeElement;
      returning.current = null;
    },
    show() {
      const current = document.activeElement;
      setFocusOnMount(
        current === owner.current || current === document.body ? 'cancel' : undefined,
      );
      setOpen(true);
    },
    cancel() {
      returning.current = ref.current?.contains(document.activeElement)
        ? document.activeElement
        : null;
      setOpen(false);
    },
    close() {
      returning.current = null;
      setOpen(false);
    },
  };
}

/** Focus the active task after its writes settle, leaving ordinary edits alone. */
export function useQuestionSetPracticeFocus(
  root: RefObject<HTMLDivElement | null>,
  position: string,
  marking: boolean,
  complete: boolean,
  pending: boolean,
  initialFocusOwner?: Element | null,
) {
  const focused = useRef('');
  const pendingFocus = useRef<Element | null | undefined>(initialFocusOwner);
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
