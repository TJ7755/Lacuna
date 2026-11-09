import type { RefObject } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';

export function QuickSearchPending({
  onClose,
  returnFocusTarget,
}: {
  onClose: () => void;
  returnFocusTarget: RefObject<HTMLElement | null>;
}) {
  const trapRef = useFocusTrap(true, { returnFocus: false });

  function close() {
    onClose();
    requestAnimationFrame(() => returnFocusTarget.current?.focus());
  }

  return (
    <DialogPanel
      label="Quick search"
      trapRef={trapRef}
      className="mt-0 max-w-xl"
      overlayClassName="pt-[max(12vh,env(safe-area-inset-top))]"
      onBackdropClick={close}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <DialogHeader title="Quick search" closeLabel="Close quick search" onClose={close} />
      <div role="status" aria-label="Loading quick search" className="flex justify-center p-6">
        <svg
          aria-hidden="true"
          className="size-6 text-ink-faint motion-safe:animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="9" opacity="0.25" />
          <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
        </svg>
      </div>
    </DialogPanel>
  );
}
