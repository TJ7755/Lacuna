import { useId, useState } from 'react';
import { Button } from '../ui/Button';

export function FeedbackSection() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const formId = (import.meta.env.VITE_TALLY_FEEDBACK_FORM_ID ?? 'zEEkv1').trim();
  if (!formId || !/^[a-zA-Z0-9]+$/.test(formId)) return null;

  return (
    <section aria-label="Feedback" className="mt-7 border-t border-line py-6">
      <Button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Close feedback' : 'Send feedback'}
      </Button>
      {open && (
        <div id={panelId} className="mt-4 max-w-2xl">
          <iframe
            title="Send feedback"
            src={`https://tally.so/embed/${formId}?alignLeft=1&hideTitle=1`}
            className="h-[min(34rem,75dvh)] w-full rounded-2xl border-0 bg-surface"
            referrerPolicy="no-referrer"
            {...{ credentialless: true }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
          <a
            href={`https://tally.so/r/${formId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-xs text-ink-faint underline underline-offset-2 hover:text-ink"
          >
            Open in a new tab
          </a>
        </div>
      )}
    </section>
  );
}
