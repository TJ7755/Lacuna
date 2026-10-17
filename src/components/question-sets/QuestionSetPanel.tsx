import { useState, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { DialogPanel } from '../ui/DialogPanel';

/** Secondary tasks use the same modal and focus handling as path editing. */
export function QuestionSetPanel({
  title,
  children,
  className = '',
  panelClassName = '',
  triggerLabel,
  closeOnSelect = false,
  canClose = true,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  triggerLabel?: string;
  closeOnSelect?: boolean;
  canClose?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trap = useFocusTrap(open);
  const close = () => {
    if (canClose) setOpen(false);
  };
  return (
    <div className={className}>
      <Button variant="ghost" aria-label={title} onClick={() => setOpen(true)}>
        {triggerLabel ?? title}
      </Button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <DialogPanel
              label={title}
              trapRef={trap}
              className={`max-w-3xl max-h-[90dvh] text-ink ${panelClassName}`}
              overlayClassName="p-4 z-[80]"
              onBackdropClick={close}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape') {
                  event.preventDefault();
                  close();
                }
              }}
            >
              <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-4">
                <h2 className="font-display text-xl">{title}</h2>
                <Button variant="ghost" onClick={close} disabled={!canClose}>
                  Close
                </Button>
              </header>
              <div
                className="qs-panel-body overflow-y-auto"
                onClick={(event) => {
                  if (
                    closeOnSelect &&
                    (event.target as HTMLElement).closest('button:not(:disabled), a[href]')
                  )
                    close();
                }}
              >
                {children}
              </div>
            </DialogPanel>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
