import { AnimatePresence } from 'motion/react';
import { useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { DialogPanel } from '../../components/ui/DialogPanel';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { JEV_PROVIDER } from '../../jev';

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

      <p
        id={warningId}
        className="mt-4 rounded-xl border border-negative/40 bg-negative/5 p-4 text-sm leading-6 text-ink"
      >
        Jev sends study text to {JEV_PROVIDER.name} in the {JEV_PROVIDER.region}. Do not include
        personal data about yourself or anyone else in material you use with Jev.
      </p>

      <ul
        id={detailsId}
        className="mt-5 flex list-disc flex-col gap-2 pl-5 text-sm leading-6 text-ink-soft"
      >
        <li>
          Jev marks answers, chooses multiple-choice options from lesson material and classifies
          authored techniques.
        </li>
        <li>
          Lacuna has zero data retention enabled with {JEV_PROVIDER.name}, which says it does not
          train Jev on submissions.
        </li>
        <li>
          Jev is experimental and can make mistakes. You can check its marks and mark answers
          yourself. Turning Jev off stops new requests.
        </li>
        <li>
          <a
            href={JEV_PROVIDER.privacyPolicyUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-accent-ink underline underline-offset-2"
          >
            {JEV_PROVIDER.name} privacy policy
          </a>
        </li>
      </ul>

      <label className="mt-5 flex items-start gap-3 rounded-xl bg-ink/[0.03] p-3 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-accent-ink"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
        />
        I understand and will keep personal data out of material I use with Jev.
      </label>

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
