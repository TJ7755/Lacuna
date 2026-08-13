import { useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { UnifiedExportPanel } from '../../components/import/UnifiedExportPanel';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { UploadIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { importBackup, readBackupFile, type ImportMode } from '../../db/portability';
import type { BackupFile } from '../../db/types';
import { manualMerge, type ManualMergeSummary } from '../../sync/manualMerge';
import { formatDate } from '../../utils/datetime';

function formatMergeSummary(summary: ManualMergeSummary): string {
  const { before, after } = summary;
  return (
    `Merged. Cards ${before.cards} → ${after.cards}. ` +
    `Courses ${before.courses} → ${after.courses}. ` +
    `Lessons ${before.lessons} → ${after.lessons}. ` +
    `Review events ${before.reviewEvents} → ${after.reviewEvents}.`
  );
}

export function DataPortabilitySection({ motionMultiplier }: { motionMultiplier: number }) {
  const { notify } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [pendingMerge, setPendingMerge] = useState<BackupFile | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);

  async function handleFile(file: File) {
    if (mergeBusy) return;
    try {
      setPendingMerge(null);
      setPending(await readBackupFile(file));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Invalid file.', 'negative');
    }
  }

  async function handleMergeFile(file: File) {
    if (mergeBusy) return;
    try {
      setPending(null);
      setConfirmReplace(false);
      setPendingMerge(await readBackupFile(file));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Invalid file.', 'negative');
    }
  }

  async function runManualMerge() {
    if (!pendingMerge || mergeBusy) return;
    setMergeBusy(true);
    try {
      const summary = await manualMerge(pendingMerge);
      notify(formatMergeSummary(summary), 'positive');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Merge failed.', 'negative');
    } finally {
      setMergeBusy(false);
      setPendingMerge(null);
    }
  }

  async function runImport(mode: ImportMode) {
    if (!pending) return;
    try {
      const report = await importBackup(pending, mode);
      const folderNames = report?.discardedFolderNames ?? [];
      const success = mode === 'replace' ? 'Data replaced from backup.' : 'Backup merged.';
      notify(
        folderNames.length > 0
          ? `${success} Folder hierarchy was discarded: ${folderNames.join(', ')}.`
          : success,
        'positive',
      );
    } catch {
      notify('Import failed.', 'negative');
    } finally {
      setPending(null);
      setConfirmReplace(false);
    }
  }

  return (
    <motion.section
      id="settings-export"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.45 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <UploadIcon width={18} height={18} />
        <h2 className="mb-1 font-display text-xl">Full backup and recovery</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        A full JSON backup contains every local course, card, schedule and media file. Use this for
        recovery or moving Lacuna between installations; course sharing and card import are separate flows.
      </p>
      <div className="mb-6"><UnifiedExportPanel heading="Export a full backup" /></div>
      <div className="border-t border-line pt-5">
        <h3 className="mb-3 font-display text-lg">Recover from a full backup</h3>
        <p className="mb-4 text-sm text-ink-soft">Choose a Lacuna full-backup JSON file, then merge it or replace this installation’s local data.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <UploadIcon width={18} height={18} />
            Choose backup file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 20 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.16 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-line-strong bg-surface-raised p-5">
              <h3 className="mb-3 font-display text-lg">Full-backup recovery</h3>
              <div className="text-sm text-ink-soft">
                <p className="mb-3">
                  This backup contains{' '}
                  <strong className="text-ink">{pending.lessons?.length ?? pending.decks?.length ?? 0}</strong> lessons and{' '}
                  <strong className="text-ink">{pending.cards.length}</strong> cards, exported on {formatDate(pending.exportedAt)}.
                </p>
                <ul className="space-y-2">
                  <li><strong className="text-ink">Merge</strong> keeps your current data and folds in the backup, with the most recently updated copy winning any conflict.</li>
                  <li><strong className="text-ink">Replace local data</strong> deletes every course and review record in this installation, then restores the backup exactly. Lacuna has no account or cloud copy to delete.</li>
                </ul>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => { setPending(null); setConfirmReplace(false); }}>Cancel</Button>
                <Button variant="secondary" onClick={() => runImport('merge')}>Merge backup</Button>
                {confirmReplace ? (
                  <ConfirmInline
                    message="Delete current local data and restore this backup?"
                    confirmLabel="Replace local data"
                    onCancel={() => setConfirmReplace(false)}
                    onConfirm={() => void runImport('replace')}
                  />
                ) : (
                  <Button variant="danger" onClick={() => setConfirmReplace(true)}>Replace local data</Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 border-t border-line pt-5">
        <h3 className="mb-3 font-display text-lg">Merge from another device</h3>
        <p className="mb-4 text-sm text-ink-soft">
          Combine this installation with a backup exported from another device. The newest version of each item is kept.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => mergeInputRef.current?.click()} disabled={mergeBusy}>
            <UploadIcon width={18} height={18} />
            Choose file to merge
          </Button>
          <input
            ref={mergeInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Merge from another device"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleMergeFile(file);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      <AnimatePresence>
        {pendingMerge && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 20 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.16 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-line-strong bg-surface-raised p-5">
              <h3 className="mb-3 font-display text-lg">Merge from another device</h3>
              <div className="text-sm text-ink-soft">
                <p className="mb-3">
                  This backup contains{' '}
                  <strong className="text-ink">{pendingMerge.lessons?.length ?? pendingMerge.decks?.length ?? 0}</strong> lessons and{' '}
                  <strong className="text-ink">{pendingMerge.cards.length}</strong> cards, exported on {formatDate(pendingMerge.exportedAt)}.
                </p>
                <ul className="space-y-2">
                  <li>Data from both devices is combined.</li>
                  <li>The newest edit of each item wins.</li>
                  <li>Deletions from either device are honoured.</li>
                  <li>A backup of this device is taken first.</li>
                </ul>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setPendingMerge(null)} disabled={mergeBusy}>Cancel</Button>
                <Button variant="secondary" onClick={() => void runManualMerge()} disabled={mergeBusy}>
                  {mergeBusy ? 'Merging…' : 'Merge'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
