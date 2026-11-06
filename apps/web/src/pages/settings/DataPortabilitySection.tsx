import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { UnifiedExportPanel } from '../../components/import/UnifiedExportPanel';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { AlertIcon, FileTextIcon, UploadIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import type { ImportMode } from '../../db/portability';
import { friendlyDbError } from '../../db/dbErrors';
import { SettingsSectionHeading, SettingsSubsectionHeading } from './SettingsSectionHeading';
import type { BackupFile } from '@lacuna/core/db/types';
import type * as ManualMergeModule from '../../sync/manualMerge';
import type { ManualMergeSummary, MergeDelta } from '../../sync/manualMerge';
import { formatDate } from '../../utils/datetime';
import { SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function formatDelta(noun: string, delta: MergeDelta): string {
  const parts = [`${plural(delta.kept, noun)} kept`];
  if (delta.added > 0) parts.push(`${delta.added} added`);
  if (delta.removed > 0) parts.push(`${delta.removed} removed`);
  return parts.join(', ');
}

function changed(delta: MergeDelta): boolean {
  return delta.added > 0 || delta.removed > 0;
}

function formatCombineSummary(summary: ManualMergeSummary): string {
  const bits = [`Combined. ${formatDelta('card', summary.cards)}.`];
  const authored: Array<[string, MergeDelta]> = [
    ['course', summary.courses],
    ['lesson', summary.lessons],
    ['Concept', summary.concepts],
    ['Question', summary.questions],
    ['Question relationship', summary.questionConcepts],
    ['Question attempt', summary.questionAttempts],
  ];
  for (const [noun, delta] of authored) {
    if (changed(delta)) bits.push(`${formatDelta(noun, delta)}.`);
  }
  if (summary.reviewEvents.added > 0 || summary.reviewEvents.removed > 0) {
    const reviews: string[] = [];
    if (summary.reviewEvents.added > 0) {
      reviews.push(`${plural(summary.reviewEvents.added, 'review')} added`);
    }
    if (summary.reviewEvents.removed > 0) {
      reviews.push(`${plural(summary.reviewEvents.removed, 'review')} removed`);
    }
    bits.push(`${reviews.join(', ')}.`);
  }
  bits.push('A restore point was saved.');
  return bits.join(' ');
}

export function DataPortabilitySection({ motionMultiplier }: { motionMultiplier: number }) {
  const { notify } = useToast();
  const recoverInputRef = useRef<HTMLInputElement>(null);
  const combineInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [pendingCombine, setPendingCombine] = useState<BackupFile | null>(null);
  const [combineBusy, setCombineBusy] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const operationRef = useRef(false);
  const mountedRef = useRef(true);
  const busy = combineBusy || reading || importMode !== null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function reportError(message: string) {
    if (mountedRef.current) setError(message);
    else notify(message, 'negative');
  }

  async function handleRecoverFile(file: File) {
    if (operationRef.current) return;
    operationRef.current = true;
    setReading(true);
    setError(null);
    try {
      const { readBackupFile } = await import('../../db/portability');
      setPending(await readBackupFile(file));
      setPendingCombine(null);
      setConfirmReplace(false);
      setFileName(file.name);
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'Invalid file.');
    } finally {
      operationRef.current = false;
      setReading(false);
    }
  }

  async function handleCombineFile(file: File) {
    if (operationRef.current) return;
    operationRef.current = true;
    setReading(true);
    setError(null);
    try {
      const { readBackupFile } = await import('../../db/portability');
      setPendingCombine(await readBackupFile(file));
      setPending(null);
      setConfirmReplace(false);
      setFileName(file.name);
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'Invalid file.');
    } finally {
      operationRef.current = false;
      setReading(false);
    }
  }

  async function runCombine() {
    if (!pendingCombine || operationRef.current) return;
    operationRef.current = true;
    setCombineBusy(true);
    setError(null);
    let mergeModule: typeof ManualMergeModule | undefined;
    try {
      mergeModule = await import('../../sync/manualMerge');
      const summary = await mergeModule.manualMerge(pendingCombine);
      notify(formatCombineSummary(summary), 'positive');
      setPendingCombine(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Combine failed.';
      const modified =
        mergeModule !== undefined &&
        error instanceof mergeModule.ManualMergeError &&
        error.databaseModified;
      reportError(
        modified ? `${message} Use a restore point if this installation looks wrong.` : message,
      );
    } finally {
      operationRef.current = false;
      setCombineBusy(false);
    }
  }

  async function runImport(mode: ImportMode) {
    if (!pending || operationRef.current) return;
    operationRef.current = true;
    setImportMode(mode);
    setError(null);
    try {
      const [{ importBackup }, { replacementLifecycle }] = await Promise.all([
        import('../../db/portability'),
        import('../../db/replacementLifecycle'),
      ]);
      await replacementLifecycle.replace(mode === 'replace' ? 'manual' : 'recovery', () =>
        importBackup(pending, mode),
      );
      notify(mode === 'replace' ? 'Data replaced from backup.' : 'Backup added.', 'positive');
      setPending(null);
      setConfirmReplace(false);
    } catch (error) {
      reportError(error instanceof Error ? friendlyDbError(error).message : 'Import failed.');
    } finally {
      operationRef.current = false;
      setImportMode(null);
    }
  }

  return (
    <SettingsCard id="settings-export">
      <div className={SETTINGS_HEADING_ROW_CLASS}>
        <UploadIcon width={18} height={18} />
        <SettingsSectionHeading className="mb-1 font-display text-xl font-semibold tracking-tight">
          Full backup and recovery
        </SettingsSectionHeading>
      </div>
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-negative">
          <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3" aria-busy={busy}>
        <UnifiedExportPanel />

        <div className="rounded-2xl bg-paper px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1 basis-64">
              <SettingsSubsectionHeading className="text-sm font-semibold text-ink">
                Combine two devices
              </SettingsSubsectionHeading>
              <p className="text-xs text-ink-soft">
                Keeps Cards, Questions and reviews from both sides; removes what either deleted.
                Saves a restore point first.
              </p>
            </div>
            {combineBusy ? (
              <Button variant="secondary" size="sm" disabled>
                Combining…
              </Button>
            ) : pendingCombine ? (
              <ConfirmInline
                message={`Combine with the ${formatDate(pendingCombine.exportedAt)} backup (${plural(pendingCombine.cards.length, 'card')}, ${plural(pendingCombine.questions?.length ?? 0, 'Question')})?`}
                confirmLabel="Combine"
                variant="default"
                disabled={busy}
                onCancel={() => {
                  setPendingCombine(null);
                  setError(null);
                }}
                onConfirm={runCombine}
              />
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => combineInputRef.current?.click()}
              >
                <UploadIcon width={16} height={16} />
                Choose backup from another device
              </Button>
            )}
            <input
              ref={combineInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={busy}
              aria-label="Backup from another device"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleCombineFile(file);
                event.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-paper px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1 basis-64">
              <SettingsSubsectionHeading className="text-sm font-semibold text-ink">
                Recover this installation
              </SettingsSubsectionHeading>
              <p className="text-xs text-ink-soft">
                Add a backup&rsquo;s contents here, or replace everything with it.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => recoverInputRef.current?.click()}
              disabled={busy}
            >
              <UploadIcon width={16} height={16} />
              Choose backup file
            </Button>
            <input
              ref={recoverInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={busy}
              aria-label="Recover this installation"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleRecoverFile(file);
                event.target.value = '';
              }}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {pending && (
          <motion.div
            aria-busy={busy}
            initial={motionMultiplier > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={motionMultiplier > 0 ? { opacity: 0 } : undefined}
            transition={{ duration: 0.16 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5"
          >
            <div className="rounded-2xl bg-paper p-5">
              <SettingsSubsectionHeading className="mb-3 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                <FileTextIcon width={18} height={18} className="shrink-0" />
                <span className="min-w-0 break-words">{fileName}</span>
              </SettingsSubsectionHeading>
              <div className="text-sm text-ink-soft">
                <p className="mb-3">
                  This backup contains{' '}
                  <strong className="text-ink">
                    {pending.lessons?.length ?? pending.decks?.length ?? 0}
                  </strong>{' '}
                  lessons and <strong className="text-ink">{pending.cards.length}</strong> cards,
                  plus <strong className="text-ink">{pending.questions?.length ?? 0}</strong>{' '}
                  Questions, exported on {formatDate(pending.exportedAt)}.
                </p>
                <ul className="space-y-2">
                  <li>
                    <strong className="text-ink">Add from backup</strong> keeps your current data
                    and folds in the backup; existing items are not deleted.
                  </li>
                  <li>
                    <strong className="text-ink">Replace local data</strong> deletes every course
                    and review record in this installation, then restores the backup exactly. Lacuna
                    has no account or cloud copy to delete. A connected AI is disconnected, and its
                    local conversation is cleared after replacement succeeds.
                  </li>
                </ul>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setPending(null);
                    setConfirmReplace(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => runImport('merge')}>
                  {importMode === 'merge' ? 'Adding…' : 'Add from backup'}
                </Button>
                {confirmReplace ? (
                  <ConfirmInline
                    message="Delete current local data, disconnect AI and restore this backup?"
                    confirmLabel={importMode === 'replace' ? 'Replacing…' : 'Replace local data'}
                    disabled={busy}
                    onCancel={() => setConfirmReplace(false)}
                    onConfirm={() => runImport('replace')}
                  />
                ) : (
                  <Button variant="danger" disabled={busy} onClick={() => setConfirmReplace(true)}>
                    Replace local data
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SettingsCard>
  );
}
