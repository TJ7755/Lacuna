import { useEffect, useState } from 'react';
import { m as motion } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { ArchiveIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import {
  backupFolderName,
  chooseBackupFolder,
  clearBackupFolder,
  deleteBackup,
  folderMirrorSupported,
  restoreBackup,
  takeAutoBackup,
} from '../../db/backups';
import { checkPersistentStorage, requestPersistentStorage, type StoragePersistenceState } from '../../db/persistence';
import { useBackups } from '../../state/useData';
import { formatDateTime } from '../../utils/datetime';

export function BackupsSection({ motionMultiplier }: { motionMultiplier: number }) {
  const { notify } = useToast();
  const backups = useBackups();
  const [persistence, setPersistence] = useState<StoragePersistenceState | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const mirrorSupported = folderMirrorSupported();

  useEffect(() => {
    void backupFolderName().then(setFolder);
    void checkPersistentStorage().then(setPersistence);
  }, []);

  async function handleBackupNow() {
    try {
      await takeAutoBackup();
      notify('Restore point saved.', 'positive');
    } catch {
      notify('Could not save a restore point.', 'negative');
    }
  }

  async function handleRestore(id: number) {
    try {
      await restoreBackup(id);
      setConfirmRestore(null);
      notify('Data restored from the selected point.', 'positive');
    } catch {
      notify('Restore failed.', 'negative');
    }
  }

  async function handleChooseFolder() {
    try {
      const name = await chooseBackupFolder();
      setFolder(name);
      if (name) notify('Backups will now mirror to that folder.', 'positive');
    } catch {
      // The user cancelling the picker is not an error worth reporting.
    }
  }

  async function handleRequestPersistence() {
    const state = await requestPersistentStorage();
    setPersistence(state);
    if (state.persisted) notify('Storage is now persisted.', 'positive');
    else if (!state.supported) notify('This browser does not support persistent storage.', 'neutral');
    else notify('Persistent storage was denied.', 'negative');
  }

  return (
    <motion.section
      id="settings-backups"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.5 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="mt-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-accent">
          <ArchiveIcon width={18} height={18} />
          <h2 className="font-display text-xl">Automatic backups</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={handleBackupNow}>Back up now</Button>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        Lacuna keeps the ten most recent restore points on this device and saves one automatically when you open it (at most once a day). Restoring replaces all current data with that snapshot.
      </p>

      {persistence && (
        <div className={cn(
          'mb-5 rounded-xl border p-4',
          persistence.persisted ? 'border-line bg-surface-raised/40' : 'border-negative bg-negative/5',
        )}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-ink">{persistence.persisted ? 'Storage is persisted' : 'Storage is not persisted'}</div>
              <p className="text-xs text-ink-faint">
                {persistence.supported ? (
                  <>
                    {persistence.persisted
                      ? 'The browser will not delete this data under storage pressure.'
                      : 'The browser may delete this data under storage pressure. Regular exports or folder mirroring are the safeguard.'}
                    {persistence.usage !== null && persistence.usage !== undefined && persistence.quota !== null && persistence.quota !== undefined && (
                      <> Using {Math.round(persistence.usage / 1024 / 1024)} MB of {Math.round(persistence.quota / 1024 / 1024)} MB.</>
                    )}
                  </>
                ) : 'This browser does not support persistent storage.'}
              </p>
            </div>
            {persistence.supported && !persistence.persisted && (
              <Button variant="secondary" size="sm" onClick={handleRequestPersistence}>Request persistence</Button>
            )}
          </div>
        </div>
      )}

      {mirrorSupported ? (
        <div className="mb-5 rounded-xl border border-line bg-surface-raised/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-ink">Mirror to a folder</div>
              <p className="text-xs text-ink-faint">
                {folder
                  ? `Backups are also written to “${folder}”. This survives clearing browser data.`
                  : 'Also write each backup to a folder on your computer, so it survives clearing browser data.'}
              </p>
            </div>
            {folder ? (
              <Button variant="ghost" size="sm" onClick={async () => {
                await clearBackupFolder();
                setFolder(null);
                notify('Folder mirroring stopped.', 'neutral');
              }}>Stop mirroring</Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={handleChooseFolder}>Choose folder</Button>
            )}
          </div>
        </div>
      ) : (
        <p className="mb-5 text-xs text-ink-faint">
          This browser cannot mirror backups to a folder; restore points are kept in the browser only. Use “Export all data” above for an off-device copy.
        </p>
      )}

      {!backups || backups.length === 0 ? (
        <p className="text-sm text-ink-faint">No restore points yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {backups.map((backup) => (
            <li key={backup.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm text-ink">{formatDateTime(backup.createdAt)}</div>
                <div className="text-xs text-ink-faint">
                  {backup.deckCount} lesson{backup.deckCount === 1 ? '' : 's'} · {backup.cardCount} card{backup.cardCount === 1 ? '' : 's'}
                </div>
              </div>
              {confirmRestore === backup.id ? (
                <ConfirmInline
                  message="Replace all data?"
                  confirmLabel="Restore"
                  variant="default"
                  onCancel={() => setConfirmRestore(null)}
                  onConfirm={() => backup.id !== null && backup.id !== undefined && void handleRestore(backup.id)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => backup.id !== null && backup.id !== undefined && void deleteBackup(backup.id)}>Delete</Button>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmRestore(backup.id !== null && backup.id !== undefined ? backup.id : null)}>Restore</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
