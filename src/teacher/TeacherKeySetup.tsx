import { useState, type FormEvent } from 'react';
import { Field, Input, inputClassName } from '../components/ui/Field';
import { SectionCard } from '../components/ui/SectionCard';
import { buttonClassName } from '../components/ui/buttonStyles';
import { createInsightsOwnerStore, InsightsOwnerConflictError } from '../insights/ownerStore';
import {
  INSIGHTS_RECOVERY_FILE_MAX_BYTES,
  InsightsRecoveryFileError,
  parseInsightsRecoveryFile,
  serialiseInsightsRecoveryFile,
} from '../insights/recoveryFile';
import type { InsightsRecovery } from '../insights/envelope';
import { parseShareCode, ShareLinkError } from '../shareLinks/client';
import { TeacherJourney } from './TeacherHomeView';
import { validateRecoveryPassphrase } from '../sync/pairingConfig';

type Mode = 'create' | 'restore' | 'download';
interface PreparedKey {
  shareId: string;
  recovery: InsightsRecovery;
}

export function TeacherKeySetup({
  onClose,
  initialCourse = '',
  initialMode = 'create',
  onContinue,
  courseName,
}: {
  onClose(): void;
  initialCourse?: string;
  courseName?: string;
  initialMode?: Mode;
  onContinue?(): void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [course, setCourse] = useState(initialCourse);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedKey | null>(null);

  const [downloaded, setDownloaded] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (mode === 'create') {
      const invalid = validateRecoveryPassphrase(passphrase);
      if (invalid) {
        setError(invalid);
        return;
      }
      if (passphrase !== confirmation) {
        setError('The passphrases do not match.');
        return;
      }
    } else if (!passphrase.trim()) {
      setError('Enter the key’s recovery passphrase.');
      return;
    }
    setBusy(true);
    const store = createInsightsOwnerStore();
    try {
      let shareId: string;
      let recovery: InsightsRecovery;
      if (mode === 'restore') {
        if (!file || file.size > INSIGHTS_RECOVERY_FILE_MAX_BYTES)
          throw new InsightsRecoveryFileError();
        const saved = parseInsightsRecoveryFile(await file.text());
        if (initialCourse && saved.shareId !== initialCourse) {
          setError(
            'This recovery file belongs to another class. Choose the recovery file for this class, or go back to classes.',
          );
          return;
        }
        shareId = saved.shareId;
        recovery = (await store.restore(shareId, saved.recovery, passphrase)).recovery;
      } else {
        shareId = parseShareCode(course);
        const owner =
          mode === 'create'
            ? await store.create(shareId, passphrase)
            : await store.unlock(shareId, passphrase);
        if (!owner) {
          setError(
            'No teacher key is saved for this course in this browser. Restore its recovery file instead.',
          );
          return;
        }
        recovery = owner.recovery;
      }
      // Keep only encrypted recovery material in the view, not the unlocked private key.
      setPrepared({ shareId, recovery });
    } catch (cause) {
      setError(
        cause instanceof InsightsOwnerConflictError ||
          cause instanceof InsightsRecoveryFileError ||
          cause instanceof ShareLinkError
          ? cause.message
          : mode === 'create'
            ? 'Could not protect this class in this browser. Check that browser storage is available and try again.'
            : 'Could not open class recovery. Check the recovery file, course link and passphrase.',
      );
    } finally {
      store.close();
      setPassphrase('');
      setConfirmation('');
      setBusy(false);
    }
  }

  function download() {
    if (!prepared) return;
    try {
      const text = serialiseInsightsRecoveryFile(prepared.shareId, prepared.recovery);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `gaps-teacher-${prepared.shareId}.json`;
      anchor.click();
      setDownloaded(true);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(
        'Could not download the recovery file. Your saved key is still in this browser; try again.',
      );
    }
  }

  return (
    <SectionCard aria-labelledby="key-setup-heading">
      <h2 tabIndex={-1} id="key-setup-heading" className="font-display text-2xl">
        {initialCourse ? 'Protect your class reports' : 'Class recovery'}
      </h2>
      {initialCourse && (
        <div className="mt-5">
          <TeacherJourney current={2} />
        </div>
      )}
      {courseName && <p className="mt-2 font-semibold">{courseName}</p>}
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        {mode === 'create'
          ? 'Choose a recovery passphrase to protect pupil results. Next, download the recovery file. Keep the file and passphrase separately; you need both if this browser loses its saved key.'
          : 'Use the recovery passphrase you chose for this class. To restore access on a new device, you also need its saved recovery file. Keep that file and passphrase separately.'}{' '}
        This is separate from your course connection file.
      </p>
      {prepared ? (
        <div className="mt-5 space-y-3">
          <p role="status" className="text-sm text-ink">
            Class protected. Download its recovery file.
          </p>
          <details className="text-sm text-ink-soft">
            <summary>Technical details</summary>
            <p className="mt-3">
              Course code: <code className="break-all">{prepared.shareId}</code>
            </p>
            <p className="text-sm text-ink-soft">
              Key fingerprint:{' '}
              <code className="break-all">{prepared.recovery.recipient.keyId}</code>
            </p>
          </details>
          <p className="text-sm text-ink-soft">
            Protecting this class does not start reporting. Pupils must join the class and choose to
            share results.
          </p>
          <button
            type="button"
            onClick={download}
            className={buttonClassName(downloaded && onContinue ? 'secondary' : 'primary')}
          >
            Download encrypted recovery file
          </button>
          {downloaded && (
            <p className="text-sm text-ink-soft">
              Download requested. Check your Downloads folder and keep the file somewhere safe
              before continuing.
            </p>
          )}
          {onContinue && downloaded && (
            <button type="button" className={buttonClassName('primary')} onClick={onContinue}>
              Continue to class
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="teacher-task mt-5 space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <Field label="What do you need to do?">
              <select
                value={mode}
                className={inputClassName}
                onChange={(event) => {
                  setMode(event.target.value as Mode);
                  setError(null);
                  setFile(null);
                  setPassphrase('');
                  setConfirmation('');
                }}
              >
                <option value="create">Set up this class for the first time</option>
                <option value="restore">Restore from a recovery file</option>
                <option value="download">Save another recovery file</option>
              </select>
            </Field>
            {mode === 'restore' ? (
              <Field
                label="Encrypted recovery file"
                hint="Select the Gaps JSON recovery file you saved earlier."
              >
                <Input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </Field>
            ) : initialCourse ? (
              <p className="text-sm text-ink-soft">
                Setting up the selected class. No course link is needed.
              </p>
            ) : (
              <Field
                label="Published course link"
                hint="Paste the course’s Lacuna share link or its 32-character code."
              >
                <Input
                  value={course}
                  onChange={(event) => setCourse(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </Field>
            )}
            <Field
              label="Recovery passphrase"
              hint={
                mode === 'create'
                  ? 'Use several unrelated words, at least 16 characters. A short PIN is not enough.'
                  : undefined
              }
            >
              <Input
                type="password"
                value={passphrase}
                autoComplete="off"
                onChange={(event) => setPassphrase(event.target.value)}
                required
              />
            </Field>
            {mode === 'create' && (
              <Field label="Repeat recovery passphrase">
                <Input
                  type="password"
                  value={confirmation}
                  autoComplete="off"
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                />
              </Field>
            )}
            <button type="submit" className={buttonClassName('primary')}>
              {busy
                ? 'Preparing key…'
                : mode === 'create'
                  ? 'Protect class reports'
                  : mode === 'restore'
                    ? 'Restore class access'
                    : 'Open saved recovery file'}
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onClose}
        className={`${buttonClassName('ghost')} mt-4`}
      >
        Back to classes
      </button>
    </SectionCard>
  );
}
