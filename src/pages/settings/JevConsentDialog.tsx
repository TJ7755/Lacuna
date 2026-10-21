import { AnimatePresence } from 'motion/react';
import { useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { DialogPanel } from '../../components/ui/DialogPanel';
import { AlertIcon } from '../../components/ui/icons';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { JEV_PROVIDER } from '../../jev';

interface JevConsentDialogProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

/** The warning shown before automatic tagging can be turned on. Nothing is sent until it is accepted. */
export function JevConsentDialog({ open, onAccept, onCancel }: JevConsentDialogProps) {
  return (
    <AnimatePresence>
      {open && <JevConsentPanel onAccept={onAccept} onCancel={onCancel} />}
    </AnimatePresence>
  );
}

function JevConsentPanel({ onAccept, onCancel }: Omit<JevConsentDialogProps, 'open'>) {
  const [understood, setUnderstood] = useState(false);
  const trapRef = useFocusTrap(true, { autoFocusSelector: '[data-jev-consent-cancel]' });
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
      <h2 className="font-display text-xl text-ink">{title}</h2>

      <div
        id={warningId}
        className="mt-4 rounded-2xl border-2 border-negative bg-negative/5 p-4 text-negative"
      >
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
          <AlertIcon width={18} height={18} aria-hidden="true" />
          Warning
        </p>
        <p className="mt-2 font-display text-xl font-semibold leading-snug sm:text-2xl">
          Your answers, with their questions and mark schemes, are sent to {JEV_PROVIDER.name} in
          the {JEV_PROVIDER.region}. Do not write personal data in your answers or cards.
        </p>
      </div>

      <ul
        id={detailsId}
        className="mt-5 flex list-disc flex-col gap-2 pl-5 text-sm leading-6 text-ink-soft"
      >
        <li>
          Only answers that need judgement are sent: a typed flashcard answer that does not match
          word for word, or a written practice answer. Each goes with its question and the expected
          answer or mark-scheme line. Your study history, schedule and other cards are not sent.
        </li>
        <li>
          {JEV_PROVIDER.name} says it does not train on what it receives. It may keep it
          indefinitely, so assume anything sent is stored.
        </li>
        <li>
          Turning this off stops all requests straight away. You can undo or change any mark it
          gives.
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
        I understand that my answers are sent to {JEV_PROVIDER.name} in the {JEV_PROVIDER.region}.
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
