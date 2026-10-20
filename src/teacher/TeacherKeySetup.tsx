import { RememberClassCheckbox } from './gapsUi';
import { useState, type FormEvent } from 'react';
import { Field, Input, inputClassName } from '../components/ui/Field';
import { CheckIcon } from '../components/ui/icons';
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
import {
  CLASS_RECOVERY_FILE_MAX_BYTES,
  CLASS_RECOVERY_ERROR,
  parseClassRecoveryFile,
  restoreClassRecovery,
} from './classRecoveryFile';
import { downloadGapsFile } from './connectionFile';
import { normaliseRecoveryCode } from './recoveryCode';
import { useClassRecoverySelection } from './classRecoveryFile';
import type { ClassSession } from './classSessions';
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
  onOpened,
}: {
  onClose?(): void;
  initialCourse?: string;
  courseName?: string;
  initialMode?: Mode;
  onContinue?(): void;
  onOpened?(session: ClassSession): void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [course, setCourse] = useState(initialCourse);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [remember, setRemember] = useState(true);
  const { codeProtected, reading } = useClassRecoverySelection(file);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedKey | null>(null);

  const [downloaded, setDownloaded] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || reading) return;
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
    } else if (!codeProtected && !passphrase.trim()) {
      setError('Enter the key’s recovery passphrase.');
      return;
    }
    setBusy(true);
    const store = createInsightsOwnerStore();
    try {
      let shareId: string;
      let recovery: InsightsRecovery;
      if (mode === 'restore' && codeProtected) {
        const code = normaliseRecoveryCode(passphrase);
        if (!code) {
          setError('Check the recovery code. It has 24 letters and numbers.');
          return;
        }
        if (!file || file.size > CLASS_RECOVERY_FILE_MAX_BYTES)
          throw new Error(CLASS_RECOVERY_ERROR);
        const saved = parseClassRecoveryFile(await file.text());
        if (initialCourse && saved.shareId !== initialCourse) throw new Error(CLASS_RECOVERY_ERROR);
        const session = await restoreClassRecovery(saved, code, remember);
        onOpened?.(session);
        return;
      }
      if (mode === 'restore') {
        if (!file || file.size > INSIGHTS_RECOVERY_FILE_MAX_BYTES)
          throw new InsightsRecoveryFileError();
        const saved = parseInsightsRecoveryFile(await file.text());
        if (initialCourse && saved.shareId !== initialCourse) {
          setError(
            'This recovery file belongs to another class. Choose the recovery file for this class.',
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
        codeProtected
          ? CLASS_RECOVERY_ERROR
          : cause instanceof InsightsOwnerConflictError ||
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
      downloadGapsFile(text, `gaps-teacher-${prepared.shareId}.json`);
      setDownloaded(true);
    } catch {
      setError(
        'Could not download the recovery file. Your saved key is still in this browser; try again.',
      );
    }
  }

  return (
    <div className="space-y-5">
      {courseName && <p className="font-semibold">{courseName}</p>}
      {prepared ? (
        <div className="gaps-fade space-y-5">
          <div className="flex items-center gap-4 rounded-2xl bg-positive/10 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-positive text-paper">
              <CheckIcon width={20} height={20} />
            </span>
            <p role="status" className="font-semibold">
              Class protected. Download its recovery file.
            </p>
          </div>
          <p className="text-sm text-ink-soft">
            Keep the file and passphrase apart. Protecting this class does not start reporting:
            pupils join and choose to share.
          </p>
          <button
            type="button"
            onClick={download}
            className={`${buttonClassName(downloaded && onContinue ? 'secondary' : 'primary', 'lg')} w-full`}
          >
            Download encrypted recovery file
          </button>
          {downloaded && (
            <p className="gaps-fade text-sm text-ink-soft">
              Download requested. Keep it somewhere safe.
            </p>
          )}
          {onContinue && downloaded && (
            <button
              type="button"
              className={`${buttonClassName('primary', 'lg')} gaps-fade w-full`}
              onClick={onContinue}
            >
              Continue to class
            </button>
          )}
          <details className="text-xs text-ink-faint">
            <summary className="cursor-pointer">Technical details</summary>
            <p className="mt-2">
              Course code: <code className="break-all">{prepared.shareId}</code>
            </p>
            <p>
              Key fingerprint:{' '}
              <code className="break-all">{prepared.recovery.recipient.keyId}</code>
            </p>
          </details>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-5">
          <fieldset disabled={busy || reading} className="space-y-5">
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
              <Field label="Encrypted recovery file">
                <Input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </Field>
            ) : (
              !initialCourse && (
                <Field
                  label="Published course link"
                  hint="The share link or its 32-character code."
                >
                  <Input
                    value={course}
                    onChange={(event) => setCourse(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </Field>
              )
            )}
            <Field
              label={codeProtected ? 'Recovery code' : 'Recovery passphrase'}
              hint={
                mode === 'create' ? 'Several unrelated words, at least 16 characters.' : undefined
              }
            >
              <Input
                type="password"
                spellCheck={codeProtected ? false : undefined}
                autoCapitalize={codeProtected ? 'characters' : undefined}
                value={passphrase}
                autoComplete="off"
                onChange={(event) => setPassphrase(event.target.value)}
                required
              />
            </Field>
            {codeProtected && <RememberClassCheckbox checked={remember} onChange={setRemember} />}
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
            <button
              type="submit"
              className={`${buttonClassName('primary', 'lg')} gaps-press w-full`}
            >
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
        <p role="alert" className="gaps-shake text-sm text-negative">
          {error}
        </p>
      )}
      {onClose && (
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className={buttonClassName('ghost')}
        >
          Back to classes
        </button>
      )}
    </div>
  );
}
