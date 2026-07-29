import { useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { UnifiedExportPanel } from '../../components/import/UnifiedExportPanel';
import { Button } from '../../components/ui/Button';
import { UploadIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { importBackup, readBackupFile, type ImportMode } from '../../db/portability';
import type { BackupFile } from '../../db/types';
import { formatDate } from '../../utils/datetime';

export function DataPortabilitySection({ motionMultiplier }: { motionMultiplier: number }) {
  const { notify } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);

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
      await importBackup(pending, mode);
      notify(mode === 'replace' ? 'Data replaced from backup.' : 'Backup merged.', 'positive');
    } catch {
      notify('Import failed.', 'negative');
    } finally {
      setPending(null);
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
        <h2 className="mb-1 font-display text-xl">Import &amp; export</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        All your data lives locally in this browser. Export it in multiple formats for backup or transfer, and import to restore or merge.
      </p>
      <div className="mb-6"><UnifiedExportPanel heading="Export your data" /></div>
      <div className="border-t border-line pt-5">
        <h3 className="mb-3 font-display text-lg">Import</h3>
        <p className="mb-4 text-sm text-ink-soft">Import a full backup file (JSON) to restore or merge your data.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <UploadIcon width={18} height={18} />
            Import from file
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
              <h3 className="mb-3 font-display text-lg">Import data</h3>
              <div className="text-sm text-ink-soft">
                <p className="mb-3">
                  This backup contains <strong className="text-ink">{pending.decks.length}</strong> lessons and{' '}
                  <strong className="text-ink">{pending.cards.length}</strong> cards, exported on {formatDate(pending.exportedAt)}.
                </p>
                <ul className="space-y-2">
                  <li><strong className="text-ink">Merge</strong> keeps your current data and folds in the backup, with the most recently updated copy winning any conflict.</li>
                  <li><strong className="text-ink">Replace all</strong> deletes everything currently stored and restores the backup exactly.</li>
                </ul>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
                <Button variant="secondary" onClick={() => runImport('merge')}>Merge</Button>
                <Button variant="primary" onClick={() => runImport('replace')}>Replace all</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
