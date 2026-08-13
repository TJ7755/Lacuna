import { useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { UnifiedExportPanel } from '../../components/import/UnifiedExportPanel';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { UploadIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { importBackup, readBackupFile, type ImportMode } from '../../db/portability';
import type { BackupFile } from '../../db/types';
import { formatDate } from '../../utils/datetime';

export function DataPortabilitySection({ motionMultiplier }: { motionMultiplier: number }) {
  const { notify } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  async function handleFile(file: File) {
    try {
      setPending(await readBackupFile(file));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Invalid file.', 'negative');
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
    <section
      id="settings-export"
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
            initial={motionMultiplier > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={motionMultiplier > 0 ? { opacity: 0 } : undefined}
            transition={{ duration: 0.16 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5"
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
    </section>
  );
}
