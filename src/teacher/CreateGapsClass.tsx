import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Input } from '../components/ui/Field';
import { buttonClassName } from '../components/ui/buttonStyles';
import { validateRecoveryPassphrase } from '../sync/pairingConfig';
import { createGapsConnectionStore } from './connectionStore';

export function CreateGapsClass({ onConnected }: { onConnected(shareId: string): void }) {
  const [link, setLink] = useState('');
  const [phrase, setPhrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  useEffect(() => linkInput.current?.focus(), []);
  useEffect(() => () => controller.current?.abort(), []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const invalid = validateRecoveryPassphrase(phrase);
    if (invalid || phrase !== repeat) {
      setError(invalid ?? 'The passphrases do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const request = new AbortController();
    controller.current = request;
    const store = createGapsConnectionStore();
    try {
      const shareId = await store.createFromLink(link, phrase, { signal: request.signal });
      if (!request.signal.aborted) onConnected(shareId);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not create the class. Try again.');
    } finally {
      store.close();
      setPhrase('');
      setRepeat('');
      setBusy(false);
    }
  }

  return (
    <form
      aria-label="Create class from a course link"
      onSubmit={(event) => void create(event)}
      className="mt-5 space-y-4"
    >
      <p className="text-sm text-ink-soft">
        Paste any published Lacuna course link. Your class has its own code and private results,
        whilst course updates continue from the original publisher. Give pupils your class code
        after setup so their results reach your class.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <Field label="Course link or code">
          <Input
            ref={linkInput}
            value={link}
            onChange={(event) => setLink(event.target.value)}
            required
          />
        </Field>
        <Field
          label="Connection passphrase"
          hint="At least 16 characters. Save a connection file after creating the class and keep this passphrase separately."
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            required
          />
        </Field>
        <Field label="Repeat connection passphrase">
          <Input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            required
          />
        </Field>
        <button type="submit" className={buttonClassName('primary')}>
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
