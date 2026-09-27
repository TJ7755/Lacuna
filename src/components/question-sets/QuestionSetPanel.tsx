import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { ModalBackdrop } from '../ui/ModalBackdrop';

/** Secondary tasks use the same modal and focus handling as path editing. */
export function QuestionSetPanel({
  title,
  children,
  className = '',
  triggerLabel,
  closeOnSelect = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  triggerLabel?: string;
  closeOnSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trap = useFocusTrap(open);
  return (
    <div className={className}>
      <Button variant="ghost" aria-label={title} onClick={() => setOpen(true)}>
        {triggerLabel ?? title}
      </Button>
      {open &&
        createPortal(
          <div
            className="qs-panel-backdrop"
            ref={trap}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
              }
            }}
          >
            <ModalBackdrop onClick={() => setOpen(false)} />
            <section className="qs-panel">
              <header>
                <h2>{title}</h2>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </header>
              <div
                className="qs-panel-body"
                onClick={(event) => {
                  if (
                    closeOnSelect &&
                    (event.target as HTMLElement).closest('button:not(:disabled), a[href]')
                  )
                    setOpen(false);
                }}
              >
                {children}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
