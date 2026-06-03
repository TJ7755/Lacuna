import { useRef, useState } from 'react';
import { useTheme } from '../state/ThemeContext';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import {
  downloadBackup,
  importBackup,
  readBackupFile,
  type ImportMode,
} from '../db/portability';
import { DownloadIcon, MoonIcon, SunIcon, UploadIcon } from '../components/ui/icons';
import type { BackupFile } from '../db/types';
import { formatDate } from '../utils/datetime';

export function Settings() {
  const { theme, setTheme } = useTheme();
  const { notify } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<BackupFile | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function handleExport() {
    try {
      await downloadBackup();
      notify('Backup downloaded.', 'positive');
    } catch {
      notify('Could not create the backup.', 'negative');
    }
  }

  async function handleFile(file: File) {
    try {
      const backup = await readBackupFile(file);
      setPending(backup);
      setImportOpen(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Invalid file.', 'negative');
    }
  }

  async function runImport(mode: ImportMode) {
    if (!pending) return;
    try {
      await importBackup(pending, mode);
      notify(
        mode === 'replace' ? 'Data replaced from backup.' : 'Backup merged.',
        'positive',
      );
    } catch {
      notify('Import failed.', 'negative');
    } finally {
      setImportOpen(false);
      setPending(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 md:px-10">
      <header className="mb-10">
        <p className="mb-1 text-sm uppercase tracking-[0.18em] text-ink-faint">
          Preferences
        </p>
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">Settings</h1>
      </header>

      {/* Appearance */}
      <section className="mb-8 rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-1 font-display text-xl">Appearance</h2>
        <p className="mb-4 text-sm text-ink-soft">
          Lacuna defaults to a dark theme. Your choice is remembered on this device.
        </p>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm">
            {theme === 'dark' ? (
              <MoonIcon width={18} height={18} />
            ) : (
              <SunIcon width={18} height={18} />
            )}
            {theme === 'dark' ? 'Dark mode' : 'Light mode'}
          </span>
          <Toggle
            checked={theme === 'light'}
            onChange={(checked) => setTheme(checked ? 'light' : 'dark')}
            label="Light"
          />
        </div>
      </section>

      {/* Data portability */}
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-1 font-display text-xl">Import &amp; export</h2>
        <p className="mb-5 text-sm text-ink-soft">
          All your data lives locally in this browser. Export it to a single JSON file
          for backup or transfer, and import to restore or merge.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={handleExport}>
            <DownloadIcon width={18} height={18} />
            Export all data
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <UploadIcon width={18} height={18} />
            Import from file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      {/* Import mode chooser */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import data"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => runImport('merge')}>
              Merge
            </Button>
            <Button variant="primary" onClick={() => runImport('replace')}>
              Replace all
            </Button>
          </>
        }
      >
        {pending && (
          <div className="text-sm text-ink-soft">
            <p className="mb-3">
              This backup contains{' '}
              <strong className="text-ink">{pending.decks.length}</strong> decks and{' '}
              <strong className="text-ink">{pending.cards.length}</strong> cards, exported
              on {formatDate(pending.exportedAt)}.
            </p>
            <ul className="space-y-2">
              <li>
                <strong className="text-ink">Merge</strong> keeps your current data and
                folds in the backup, with the most recently updated copy winning any
                conflict.
              </li>
              <li>
                <strong className="text-ink">Replace all</strong> deletes everything
                currently stored and restores the backup exactly.
              </li>
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
