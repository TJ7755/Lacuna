import { useEffect, useRef, useState } from 'react';
import { buttonClassName } from '../components/ui/buttonStyles';
import { Field, Input } from '../components/ui/Field';
import { CheckIcon } from '../components/ui/icons';
import { SectionCard } from '../components/ui/SectionCard';
import { StudyDrawing } from '../components/ui/StudyDrawing';
import { publishClassRecipient } from '../insights/classKey';
import { requestShortClassCode } from '../shareLinks/client';
import { formatClassCode, formatShortClassCode } from '../insights/classCode';
import { type ConnectedGapsCourse } from './connectionStore';
import { Spinner } from './gapsUi';
import type { ClassSession } from './StandaloneTeacherHome';

export function Invite({
  course,
  session,
  onChanged,
}: {
  course: ConnectedGapsCourse;
  session: ClassSession;
  onChanged(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const request = useRef<AbortController | null>(null);
  const code = session.code;
  const shortCode = session.shortCode ? formatShortClassCode(session.shortCode) : '';
  const link = code ? `https://getlacuna.app/#/s/${code}` : '';

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(''), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  async function publish() {
    if (busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      await publishClassRecipient({
        ...session.connection,
        recipient: session.owner.recipient,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      session.code = formatClassCode({
        shareId: course.shareId,
        keyId: session.owner.recipient.keyId,
      });
      onChanged();
      try {
        session.shortCode = await requestShortClassCode({
          ...session.connection,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        onChanged();
      } catch {
        if (!controller.signal.aborted)
          setError('Could not create a short code. Pupils can still use the join link.');
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not publish the class code.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(message);
    } catch {
      setCopied('Select the field and copy it manually.');
    }
  }

  return (
    <SectionCard className="gaps-rise max-w-3xl p-6 md:p-8">
      <fieldset className="min-w-0">
        <legend className="mb-5 font-display text-2xl font-semibold">Give this to pupils</legend>
        {!code ? (
          <div className="flex flex-col items-center py-8 text-center">
            <StudyDrawing kind="course" className="mb-6 h-24 w-24" />
            <p className="mt-3 max-w-sm text-ink-soft">
              Pupils join with a class code, then choose whether to share.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void publish()}
              className={`${buttonClassName('primary', 'lg')} gaps-press mt-8`}
            >
              {busy && <Spinner />}
              {busy ? 'Preparing class code…' : 'Publish class code'}
            </button>
          </div>
        ) : (
          <div className="gaps-fade space-y-6">
            <Field label="Pupil join link">
              <Input
                readOnly
                value={link}
                onFocus={(event) => event.target.select()}
                className="font-mono text-sm"
              />
            </Field>
            {shortCode && (
              <p className="text-sm text-ink-soft">
                Pupils open getlacuna.app, choose Import, then Join a class, and enter this code.
                The pupil join link is an alternative.
              </p>
            )}
            {shortCode && (
              <Field label="Class code">
                <Input
                  readOnly
                  value={shortCode}
                  onFocus={(event) => event.target.select()}
                  className="font-mono text-3xl tracking-wider"
                />
              </Field>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={`${buttonClassName('primary')} gaps-press`}
                onClick={() => void copy(link, 'Join link copied')}
              >
                Copy join link
              </button>
              {shortCode && (
                <button
                  type="button"
                  className={`${buttonClassName('secondary')} gaps-press`}
                  onClick={() => void copy(shortCode, 'Class code copied')}
                >
                  Copy code
                </button>
              )}
              {copied && (
                <span
                  role="status"
                  className="gaps-fade inline-flex items-center gap-1.5 text-sm font-semibold text-positive"
                >
                  <CheckIcon width={16} height={16} /> {copied}
                </span>
              )}
            </div>
          </div>
        )}
      </fieldset>
      <fieldset className="mt-8 border-t border-line pt-5">
        <legend className="font-semibold">Keep this private to reopen the class</legend>
        <p className="mt-2 text-sm text-ink-soft">
          Your recovery code and file are for you. Do not send them to pupils. Older classes use
          their connection and recovery files with their passphrases.
        </p>
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 text-sm text-negative">
          {error}
        </p>
      )}
    </SectionCard>
  );
}
