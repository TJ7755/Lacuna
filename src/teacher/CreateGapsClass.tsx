import { RememberClassCheckbox } from './gapsUi';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Input, inputFrameClassName } from '../components/ui/Field';
import { buttonClassName } from '../components/ui/buttonStyles';
import { createInsightsOwnerStore } from '../insights/ownerStore';
import { createGapsConnectionStore } from './connectionStore';
import { formatRecoveryCode, generateRecoveryCode } from './recoveryCode';
import { downloadClassRecoveryFile } from './classRecoveryFile';
import { rememberClass } from './rememberedClass';
import type { ClassSession } from './classSessions';

export function CreateGapsClass({
  initialCourseLink = '',
  onConnected,
  onCreated,
}: {
  initialCourseLink?: string;
  onConnected(shareId: string, session: ClassSession): void;
  onCreated?(): void;
}) {
  const [link, setLink] = useState(initialCourseLink);
  const [remember, setRemember] = useState(true);
  const [created, setCreated] = useState<{
    shareId: string;
    code: string;
    session: ClassSession;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (created) doneHeading.current?.focus();
  }, [created]);
  const linkInput = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (initialCourseLink ? submitButton.current : linkInput.current)?.focus();
  }, [initialCourseLink]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const request = new AbortController();
    controller.current = request;
    const connections = createGapsConnectionStore(),
      keys = createInsightsOwnerStore();
    let shareId: string | undefined;
    try {
      const code = generateRecoveryCode();
      shareId = await connections.createFromLink(link, code, { signal: request.signal });
      request.signal.throwIfAborted();
      const owner = await keys.create(shareId, code);
      request.signal.throwIfAborted();
      await connections.markRecoveryCode(shareId);
      const connection = await connections.unlock(shareId, code);
      if (!connection) throw new Error();
      const next: ClassSession = { connection, owner, days: new Map() };
      request.signal.throwIfAborted();
      if (remember) {
        next.remembered = await rememberClass(next);
        if (!next.remembered) throw new Error();
      }
      request.signal.throwIfAborted();
      setCreated({ shareId, code, session: next });
      onCreated?.();
    } catch (cause) {
      if (shareId) {
        // Attempt both stores even if one cannot remove its records.
        await Promise.allSettled([connections.forget(shareId), keys.forget(shareId)]);
      }
      if (!request.signal.aborted)
        setError(
          shareId
            ? 'Could not finish setting up the class. Try again.'
            : cause instanceof Error
              ? cause.message
              : 'Could not create the class. Try again.',
        );
    } finally {
      connections.close();
      keys.close();
      setBusy(false);
    }
  }

  async function download() {
    if (!created) return;
    setError(null);
    try {
      await downloadClassRecoveryFile(created.shareId);
    } catch {
      setError('Could not download the recovery file. Try downloading it again.');
    }
  }

  if (created)
    return (
      <div className="space-y-5">
        <h2 ref={doneHeading} tabIndex={-1} className="font-display text-3xl font-semibold">
          Class created
        </h2>
        <div>
          <p id="recovery-code-label" className="text-sm font-semibold">
            Recovery code
          </p>
          <div
            aria-labelledby="recovery-code-label"
            className={`mt-2 select-text font-mono text-sm ${inputFrameClassName}`}
          >
            <span className="block whitespace-nowrap">
              {formatRecoveryCode(created.code.slice(0, 12))}
            </span>
            <span className="block whitespace-nowrap">
              {formatRecoveryCode(created.code.slice(12))}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={buttonClassName('secondary')}
            onClick={() => {
              void navigator.clipboard.writeText(formatRecoveryCode(created.code)).then(
                () => setCopied(true),
                () => undefined,
              );
            }}
          >
            {copied ? 'Copied' : 'Copy code'}
          </button>
          <button
            type="button"
            className={buttonClassName('primary')}
            onClick={() => void download()}
          >
            Download class recovery file
          </button>
        </div>
        <p className="text-sm text-ink-soft">
          You need this code and the file to open the class on another device. This is the only time
          the code is shown.
        </p>
        <button
          type="button"
          className={buttonClassName('primary')}
          onClick={() => onConnected(created.shareId, created.session)}
        >
          Continue to class
        </button>
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <form
      aria-label="Create class from a course link"
      onSubmit={(event) => void create(event)}
      className="mt-5 space-y-5"
    >
      <fieldset disabled={busy} className="space-y-5">
        <Field label="Course link or code">
          <Input
            ref={linkInput}
            value={link}
            onChange={(event) => setLink(event.target.value)}
            required
          />
        </Field>
        <RememberClassCheckbox checked={remember} onChange={setRemember} />
        <button ref={submitButton} type="submit" className={buttonClassName('primary')}>
          {busy ? 'Creating class…' : 'Create class'}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </form>
  );
}
