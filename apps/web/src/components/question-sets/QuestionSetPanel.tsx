import { useState, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { Button } from '../ui/Button';
import { ExpandingSheet } from '../ui/ExpandingSheet';

/** Secondary tasks grow from their trigger into a sheet and shrink back onto it. */
export function QuestionSetPanel({
  title,
  children,
  className = '',
  panelClassName = '',
  triggerLabel,
  icon,
  closeOnSelect = false,
  canClose = true,
  onOpen,
}: {
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
  panelClassName?: string;
  triggerLabel?: string;
  /** Render the trigger as an icon button, named and tooltipped by the title. */
  icon?: ReactNode;
  closeOnSelect?: boolean;
  canClose?: boolean;
  onOpen?: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  return (
    <div className={className}>
      <Button
        variant="ghost"
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        title={icon ? title : undefined}
        className={icon ? 'qs-icon-button' : undefined}
        // The sheet owns the press, growing from the trigger's resting bounds.
        pressScale={false}
        hoverScale={false}
        style={{ visibility: anchor ? 'hidden' : undefined }}
        onClick={(event) => {
          onOpen?.();
          setAnchor(event.currentTarget);
        }}
      >
        {icon ?? triggerLabel ?? title}
      </Button>
      <AnimatePresence>
        {anchor && (
          <ExpandingSheet
            anchor={anchor}
            maxWidth={640}
            closeLabel="Close"
            closeDisabled={!canClose}
            autoFocusSelector="textarea"
            onClose={close}
            face={(headingId) => (
              <header className="px-6 pb-2 pt-5 pr-16">
                <h2 id={headingId} className="font-display text-xl">
                  {title}
                </h2>
              </header>
            )}
          >
            <div
              className={`qs-panel-body px-6 pb-6 text-ink ${panelClassName}`}
              onClick={(event) => {
                if (
                  closeOnSelect &&
                  (event.target as HTMLElement).closest('button:not(:disabled), a[href]')
                )
                  close();
              }}
            >
              {typeof children === 'function' ? children(close) : children}
            </div>
          </ExpandingSheet>
        )}
      </AnimatePresence>
    </div>
  );
}
