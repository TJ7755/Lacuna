import { RememberClassCheckbox } from './gapsUi';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Input } from '../components/ui/Field';
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
  const [pending, setPending] = useState<{ shareId: string; code: string } | null>(null);
  const [session, setSession] = useState<ClassSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (session) doneHeading.current?.focus();
  }, [session]);
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
    let prepared = pending;
    try {
      if (!prepared) {
        const code = generateRecoveryCode();
        const shareId = await connections.createFromLink(link, code, { signal: request.signal });
        prepared = { shareId, code };
        if (request.signal.aborted) return;
        setPending(prepared);
      }
      const { shareId, code } = prepared;
      const owner = (await keys.unlock(shareId, code)) ?? (await keys.create(shareId, code));
      await connections.markRecoveryCode(shareId);
      const connection = await connections.unlock(shareId, code);
      if (!connection) throw new Error();
      const next: ClassSession = { connection, owner, days: new Map() };
      if (remember) next.remembered = await rememberClass(next);
      if (!request.signal.aborted) {
        setSession(next);
        onCreated?.();
      }
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          prepared
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
    if (!pending) return;
    setError(null);
    try {
      await downloadClassRecoveryFile(pending.shareId);
      setDownloaded(true);
    } catch {
      setError('Could not finish setting up the class. Try again.');
    }
  }

  if (session && pending)
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
            className="mt-2 select-text break-words rounded-xl bg-surface p-4 font-mono text-2xl"
          >
            {formatRecoveryCode(pending.code)}
          </div>
        </div>
        <button
          type="button"
          className={buttonClassName('secondary')}
          onClick={() => {
            void navigator.clipboard.writeText(formatRecoveryCode(pending.code)).then(
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
        <p className="text-sm text-ink-soft">
          You need this code and the file to open the class on another device. This is the only time
          the code is shown.
        </p>
        {downloaded && (
          <button
            type="button"
            className={buttonClassName('primary')}
            onClick={() => onConnected(pending.shareId, session)}
          >
            Continue to class
          </button>
        )}
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
      className="mt-5 space-y-4"
    >
      <fieldset disabled={busy} className="space-y-4">
        <Field label="Course link or code">
          <Input
            ref={linkInput}
            value={link}
            disabled={Boolean(pending)}
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
