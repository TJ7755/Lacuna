import { useId, useState } from 'react';
import { Button } from '../ui/Button';

export function FeedbackSection() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const formId = (import.meta.env.VITE_TALLY_FEEDBACK_FORM_ID ?? 'zEEkv1').trim();
  if (!formId || !/^[a-zA-Z0-9]+$/.test(formId)) return null;

  return (
    <section aria-label="Feedback" className="mt-7 border-t border-line py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close feedback' : 'Send feedback'}
        </Button>
        <p className="text-sm text-ink-soft">No account needed. No study data is attached.</p>
      </div>
      {open && (
        <div id={panelId}>
          <p className="mt-4 text-sm text-ink-soft">
            Tally hosts this form and handles your feedback. Do not include your name or school.
            Contact details are optional. If the form does not load,{' '}
            <a
              href={`https://tally.so/r/${formId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent-ink underline underline-offset-2"
            >
              open it in a new tab
            </a>
            .
          </p>
          <iframe
            title="Send feedback"
            src={`https://tally.so/embed/${formId}?alignLeft=1&hideTitle=1`}
            className="mt-4 h-[min(42rem,75dvh)] w-full rounded-2xl border-0 bg-white"
            referrerPolicy="no-referrer"
            {...{ credentialless: true }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      )}
    </section>
  );
}
