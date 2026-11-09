import { AnimatePresence } from 'motion/react';
import { useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { DialogPanel } from '../../components/ui/DialogPanel';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { JevConsentNotice } from '../../jev';

interface JevConsentDialogProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

/** The warning shown before automatic marking can be turned on. Nothing is sent until it is accepted. */
export function JevConsentDialog({ open, onAccept, onCancel }: JevConsentDialogProps) {
  return (
    <AnimatePresence>
      {open && <JevConsentPanel onAccept={onAccept} onCancel={onCancel} />}
    </AnimatePresence>
  );
}

function JevConsentPanel({ onAccept, onCancel }: Omit<JevConsentDialogProps, 'open'>) {
  const [understood, setUnderstood] = useState(false);
  const trapRef = useFocusTrap(true, { autoFocusSelector: '[data-jev-consent-title]' });
  const warningId = useId();
  const detailsId = useId();
  const title = 'Before you turn on automatic marking';

  return (
    <DialogPanel
      label={title}
      role="alertdialog"
      describedBy={`${warningId} ${detailsId}`}
      trapRef={trapRef}
      className="max-w-lg overflow-y-auto p-6"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <h2
        data-jev-consent-title=""
        tabIndex={-1}
        className="font-display text-xl text-ink"
        onKeyDown={(event) => {
          if (event.key === 'Tab' && event.shiftKey) {
            event.preventDefault();
            const buttons =
              trapRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
            buttons?.item(buttons.length - 1)?.focus();
          }
        }}
      >
        {title}
      </h2>

      <div className="mt-4">
        <JevConsentNotice
          checked={understood}
          onChange={setUnderstood}
          warningId={warningId}
          detailsId={detailsId}
        />
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button data-jev-consent-cancel="" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={!understood} onClick={onAccept}>
          Turn on
        </Button>
      </div>
    </DialogPanel>
  );
}
