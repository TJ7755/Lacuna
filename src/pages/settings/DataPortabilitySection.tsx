import { useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { UnifiedExportPanel } from '../../components/import/UnifiedExportPanel';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { UploadIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { importBackup, readBackupFile, type ImportMode } from '../../db/portability';
import { SettingsSectionHeading, SettingsSubsectionHeading } from './SettingsSectionHeading';
import type { BackupFile } from '../../db/types';
import {
  ManualMergeError,
  manualMerge,
  type ManualMergeSummary,
  type MergeDelta,
} from '../../sync/manualMerge';
import { formatDate } from '../../utils/datetime';
import { replacementLifecycle } from '../../db/replacementLifecycle';

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

  async function handleRecoverFile(file: File) {
    if (combineBusy) return;
    try {
      setPendingCombine(null);
      setPending(await readBackupFile(file));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Invalid file.', 'negative');
    }
  }

  async function handleCombineFile(file: File) {
    if (combineBusy) return;
    try {
      setPending(null);
      setConfirmReplace(false);
      setPendingCombine(await readBackupFile(file));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Invalid file.', 'negative');
    }
  }

  async function runCombine() {
    if (!pendingCombine || combineBusy) return;
    setCombineBusy(true);
    try {
      const summary = await manualMerge(pendingCombine);
      notify(formatCombineSummary(summary), 'positive');
      setPendingCombine(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Combine failed.';
      const modified = error instanceof ManualMergeError && error.databaseModified;
      notify(
        modified
          ? `${message} Restore from Automatic backups if this installation looks wrong.`
          : message,
        'negative',
      );
    } finally {
      setCombineBusy(false);
    }
  }

  async function runImport(mode: ImportMode) {
    if (!pending) return;
    try {
      await replacementLifecycle.replace(mode === 'replace' ? 'manual' : 'recovery', () =>
        importBackup(pending, mode),
      );
      notify(mode === 'replace' ? 'Data replaced from backup.' : 'Backup added.', 'positive');
    } catch {
      notify('Import failed.', 'negative');
    } finally {
      setPending(null);
      setConfirmReplace(false);
    }
  }

  return (
    <section id="settings-export" className="rounded-2xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center gap-2 text-accent">
        <UploadIcon width={18} height={18} />
        <SettingsSectionHeading className="mb-1 font-display text-xl">
          Full backup and recovery
        </SettingsSectionHeading>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        A full JSON backup contains every local course, Card, Question, attempt, schedule and media
        file. Export one to keep a copy, combine two devices, or recover this installation. Course
        sharing and Card import are separate flows.
      </p>
      <div className="mb-6">
        <UnifiedExportPanel heading="Export a full backup" />
      </div>

      <div className="border-t border-line pt-5">
        <SettingsSubsectionHeading className="mb-3 font-display text-lg">
          Another device
        </SettingsSubsectionHeading>
        <p className="mb-4 text-sm text-ink-soft">
          Combine this installation with a backup from another device. Cards, Questions and review
          evidence from either side are kept; content deleted on either is removed. A restore point
          is saved first.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {combineBusy ? (
            <Button variant="secondary" disabled>
              Combining…
            </Button>
          ) : pendingCombine ? (
            <ConfirmInline
              message={`Combine with the ${formatDate(pendingCombine.exportedAt)} backup (${plural(pendingCombine.cards.length, 'card')}, ${plural(pendingCombine.questions?.length ?? 0, 'Question')})?`}
              confirmLabel="Combine"
              variant="default"
              onCancel={() => setPendingCombine(null)}
              onConfirm={() => void runCombine()}
            />
          ) : (
            <Button variant="secondary" onClick={() => combineInputRef.current?.click()}>
              <UploadIcon width={18} height={18} />
              Choose backup from another device
            </Button>
          )}
          <input
            ref={combineInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Backup from another device"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleCombineFile(file);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <SettingsSubsectionHeading className="mb-3 font-display text-lg">
          Recover this installation
        </SettingsSubsectionHeading>
        <p className="mb-4 text-sm text-ink-soft">
          Choose a backup file to add its contents to this installation, or to replace everything
          here.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => recoverInputRef.current?.click()}
            disabled={combineBusy}
          >
            <UploadIcon width={18} height={18} />
            Choose backup file
          </Button>
          <input
            ref={recoverInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Recover this installation"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleRecoverFile(file);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      <AnimatePresence>
        {pending && (
          <motion.div
            initial={motionMultiplier > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={motionMultiplier > 0 ? { opacity: 0 } : undefined}
            transition={{ duration: 0.16 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5"
          >
            <div className="rounded-xl border border-line-strong bg-surface-raised p-5">
              <SettingsSubsectionHeading className="mb-3 font-display text-lg">
                Full-backup recovery
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
                  onClick={() => {
                    setPending(null);
                    setConfirmReplace(false);
                  }}
                >
                  Cancel
                </Button>
                <Button variant="secondary" onClick={() => runImport('merge')}>
                  Add from backup
                </Button>
                {confirmReplace ? (
                  <ConfirmInline
                    message="Delete current local data, disconnect AI and restore this backup?"
                    confirmLabel="Replace local data"
                    onCancel={() => setConfirmReplace(false)}
                    onConfirm={() => void runImport('replace')}
                  />
                ) : (
                  <Button variant="danger" onClick={() => setConfirmReplace(true)}>
                    Replace local data
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
