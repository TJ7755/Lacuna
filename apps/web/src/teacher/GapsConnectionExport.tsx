import { useState, type FormEvent } from 'react';
import { readShareCredentials } from '../shareLinks/credentials';
import { DEFAULT_RELAY_URL, validateRecoveryPassphrase } from '../sync/pairingConfig';
import { Field, Input } from '../components/ui/Field';
import { buttonClassName } from '../components/ui/buttonStyles';
import { sealGapsConnection } from './connectionFile';

export function GapsConnectionExport({
  shareId,
  courseName,
}: {
  shareId: string;
  courseName: string;
}) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function download(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const invalid = validateRecoveryPassphrase(phrase);
    if (invalid || phrase !== confirmation) {
      setError(invalid ?? 'The passphrases do not match.');
      return;
    }
    setError(null);
    setBusy(true);
    setDownloaded(false);
    try {
      const credentials = await readShareCredentials(shareId);
      if (!credentials) {
        setError(
          'Open the browser or desktop app that published this course to export its connection.',
        );
        return;
      }
      if (credentials.relayUrl !== DEFAULT_RELAY_URL) {
        setError(
          'This course uses a different relay. Gaps trial connections currently support relay.getlacuna.app.',
        );
        return;
      }
      const text = await sealGapsConnection(
        { shareId, courseName, relayUrl: credentials.relayUrl, writeToken: credentials.writeToken },
        phrase,
      );
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `gaps-course-${shareId}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
    } catch {
      setError(
        'Could not export the course connection. Your course and share link are unchanged; try again.',
      );
    } finally {
      setPhrase('');
      setConfirmation('');
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName('secondary')}>
        Connect to Gaps
      </button>
    );
  return (
    <form
      onSubmit={(event) => void download(event)}
      className="mt-5 space-y-4 rounded-2xl bg-paper p-4"
      aria-label="Export Gaps connection"
    >
      <h3 className="font-display text-xl">Connect this course to Gaps</h3>
      <p className="text-sm text-ink-soft">
        Download an encrypted connection file, then import it at gaps.getlacuna.app. The file gives
        Gaps ownership access to this share link. Keep it and its passphrase separately; do not send
        them to pupils.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <Field
          label="Connection passphrase"
          hint="Use several unrelated words, at least 16 characters. You will enter this in Gaps to open the file."
        >
          <Input
            type="password"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Repeat connection passphrase">
          <Input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <button type="submit" className={buttonClassName('primary')}>
          {busy ? 'Encrypting connection…' : 'Download connection file'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPhrase('');
            setConfirmation('');
            setError(null);
            setDownloaded(false);
          }}
          className={`${buttonClassName('ghost')} ml-2`}
        >
          Close
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      {downloaded && (
        <p role="status" className="text-sm text-ink">
          Connection file prepared.{' '}
          <a className="underline" href="https://gaps.getlacuna.app">
            Open Gaps to import it
          </a>
          . This does not enable pupil results.
        </p>
      )}
    </form>
  );
}
