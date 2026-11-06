import type { RefObject } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';
import { LoadingIndicator } from '../ui/LoadingIndicator';

/** The uncached search chunk has the same modal ownership as the ready palette. */
export function QuickSearchPending({
  onClose,
  returnFocusTarget,
}: {
  onClose: () => void;
  returnFocusTarget: RefObject<HTMLElement | null>;
}) {
  const trapRef = useFocusTrap(true, { returnFocus: false });
  const close = () => {
    onClose();
    requestAnimationFrame(() => returnFocusTarget.current?.focus());
  };
  return (
    <DialogPanel
      label="Quick search"
      trapRef={trapRef}
      className="max-w-xl"
      overlayClassName="pt-[12vh]"
      onBackdropClick={close}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <DialogHeader title="Quick search" closeLabel="Close quick search" onClose={close} />
      <LoadingIndicator label="Loading quick search" />
    </DialogPanel>
  );
}
