import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { BackupHero } from './BackupHero';
import { SettingsModal } from './SettingsModal';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { RestoreIcon } from '../../components/ui/icons';
import { motionTransition } from '../../components/ui/motion';
import { useToast } from '../../components/ui/Toast';
import {
  backupFolderName,
  chooseBackupFolder,
  clearBackupFolder,
  folderMirrorSupported,
} from '../../db/backupFolder';
import {
  checkPersistentStorage,
  requestPersistentStorage,
  type StoragePersistenceState,
} from '../../db/persistence';
import { useBackups } from '../../state/useData';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { formatDateTime } from '../../utils/datetime';

export function BackupsSection() {
  const { notify } = useToast();
  const backups = useBackups();
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const [persistence, setPersistence] = useState<StoragePersistenceState | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ id: number; at: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const backupNowButton = useRef<HTMLButtonElement>(null);
  const lastAt =
    backups && backups.length > 0 ? Math.max(...backups.map((b) => b.createdAt)) : null;
  const deleteButtons = useRef(new Map<number, HTMLButtonElement>());
  const deleteFocusReturn = useRef<number | null>(null);
  const mirrorSupported = folderMirrorSupported();
  const supportsPersistenceRequest = !window.electronAPI?.isElectron;

  useEffect(() => {
    let cancelled = false;
    backupFolderName().then(
      (name) => {
        if (!cancelled) setFolder(name);
      },
      () => {
        // A configured folder must not silently read as "not configured".
        if (!cancelled) notify('Could not read the backup folder setting.', 'negative');
      },
    );
    if (supportsPersistenceRequest) {
      checkPersistentStorage().then(
        (state) => {
          if (!cancelled) setPersistence(state);
        },
        () => {
          // Best-effort: with no answer the persistence row stays hidden rather than guessing.
        },
      );
    }
    return () => {
      cancelled = true;
    };
    // `notify` is deliberately omitted: the reads must run once, not on every toast change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsPersistenceRequest]);

  useEffect(() => {
    if (confirmDelete !== null || deleteFocusReturn.current === null) return;
    const backupId = deleteFocusReturn.current;
    deleteFocusReturn.current = null;
    deleteButtons.current.get(backupId)?.focus();
  }, [confirmDelete]);

  async function handleBackupNow(): Promise<boolean> {
    try {
      const { takeAutoBackup } = await import('../../db/backups');
      // Forced: a deliberate click must not be swallowed by the automatic-save throttle.
      await takeAutoBackup(true);
      return true;
    } catch {
      notify('Could not save a restore point.', 'negative');
      return false;
    }
  }

  async function handleRestore(id: number) {
    setRestoring(true);
    try {
      const { restoreBackup } = await import('../../db/backups');
      await restoreBackup(id);
      setRestoreTarget(null);
      notify('Data restored from the selected point.', 'positive');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Restore failed.', 'negative');
    } finally {
      setRestoring(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const { deleteBackup } = await import('../../db/backups');
      await deleteBackup(id);
      setConfirmDelete(null);
      backupNowButton.current?.focus();
      notify('Restore point deleted from Lacuna. Mirrored files were not removed.', 'neutral');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not delete the restore point.',
        'negative',
      );
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
    else if (!state.supported)
      notify('This browser does not support persistent storage.', 'neutral');
    else
      notify('Persistent storage was denied.', 'negative', {
        actionLabel: 'Export backup',
        onAction: () => {
          window.location.hash = '#/settings#settings-export';
        },
      });
  }

  const subtleRow = 'rounded-2xl bg-paper px-4 py-3';

  return (
    <>
      <BackupHero ref={backupNowButton} lastAt={lastAt} onBackUp={handleBackupNow}>
        {supportsPersistenceRequest && persistence && (
          <div className={cn(subtleRow, !persistence.persisted && 'bg-negative/10')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">
                  {persistence.persisted ? 'Storage is persisted' : 'Storage is not persisted'}
                </div>
                <p className="text-xs text-ink-soft">
                  {persistence.supported ? (
                    <>
                      {persistence.persisted
                        ? 'The browser will not delete this data under storage pressure.'
                        : 'The browser may delete this data under storage pressure. Regular exports or folder mirroring are the safeguard.'}
                      {persistence.usage !== null &&
                        persistence.usage !== undefined &&
                        persistence.quota !== null &&
                        persistence.quota !== undefined && (
                          <>
                            {' '}
                            Using {Math.round(persistence.usage / 1024 / 1024)} MB of{' '}
                            {Math.round(persistence.quota / 1024 / 1024)} MB.
                          </>
                        )}
                    </>
                  ) : (
                    'This browser does not support persistent storage.'
                  )}
                </p>
              </div>
              {persistence.supported && !persistence.persisted && (
                <Button variant="secondary" size="sm" onClick={handleRequestPersistence}>
                  Request persistence
                </Button>
              )}
            </div>
          </div>
        )}

        {mirrorSupported ? (
          <div className={subtleRow}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">Mirror to a folder</div>
                <p className="text-xs text-ink-soft">
                  {folder
                    ? `Backups are also written to “${folder}”. This survives clearing browser data.`
                    : 'Also write each backup to a folder on your computer, so it survives clearing browser data.'}
                </p>
              </div>
              {folder ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await clearBackupFolder();
                    setFolder(null);
                    notify('Folder mirroring stopped.', 'neutral');
                  }}
                >
                  Stop mirroring
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={handleChooseFolder}>
                  Choose folder
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">
            This browser cannot mirror backups to a folder; restore points are kept in the browser
            only. Use “Export all data” below for an off-device copy.
          </p>
        )}
      </BackupHero>

      <SettingsCard>
        <div className={cn('mb-4', SETTINGS_HEADING_ROW_CLASS)}>
          <RestoreIcon width={18} height={18} />
          <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
            Restore points
          </SettingsSectionHeading>
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {!backups || backups.length === 0 ? (
            <motion.p
              key="empty"
              initial={motionMultiplier > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={motionMultiplier > 0 ? { opacity: 0 } : undefined}
              transition={motionTransition('feedback', motionMultiplier)}
              className="text-sm text-ink-faint"
            >
              No restore points yet.
            </motion.p>
          ) : (
            <motion.ul
              key="restore-points"
              layout={motionMultiplier > 0 ? 'size' : undefined}
              animate={{ opacity: 1, y: 0 }}
              exit={motionMultiplier > 0 ? { opacity: 0, y: -4 } : undefined}
              transition={motionTransition('feedback', motionMultiplier)}
              className="flex flex-col gap-2"
            >
              <AnimatePresence initial={false} mode="popLayout" propagate>
                {backups.map((backup) => (
                  <motion.li
                    key={backup.id}
                    layout={motionMultiplier > 0 ? 'position' : undefined}
                    initial={motionMultiplier > 0 ? { opacity: 0, y: -4 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={motionMultiplier > 0 ? { opacity: 0, y: -4 } : undefined}
                    transition={motionTransition('feedback', motionMultiplier)}
                    className={cn('flex flex-wrap items-center justify-between gap-3', subtleRow)}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">
                        {formatDateTime(backup.createdAt)}
                      </div>
                      <div className="text-xs text-ink-soft">
                        {backup.deckCount} lesson{backup.deckCount === 1 ? '' : 's'} ·{' '}
                        {backup.cardCount} card{backup.cardCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    {confirmDelete === backup.id ? (
                      <ConfirmInline
                        message="Delete this restore point from Lacuna? Mirrored files are not removed."
                        confirmLabel="Delete restore point"
                        announce
                        focusOnMount="confirm"
                        onCancel={() => {
                          if (backup.id === null || backup.id === undefined) return;
                          deleteFocusReturn.current = backup.id;
                          setConfirmDelete(null);
                        }}
                        onConfirm={() =>
                          backup.id !== null &&
                          backup.id !== undefined &&
                          void handleDelete(backup.id)
                        }
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          ref={(button) => {
                            if (backup.id === null || backup.id === undefined) return;
                            if (button) deleteButtons.current.set(backup.id, button);
                            else deleteButtons.current.delete(backup.id);
                          }}
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setConfirmDelete(
                              backup.id !== null && backup.id !== undefined ? backup.id : null,
                            )
                          }
                        >
                          Delete
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            if (backup.id === null || backup.id === undefined) return;
                            setConfirmDelete(null);
                            setRestoreTarget({ id: backup.id, at: backup.createdAt });
                          }}
                        >
                          Restore
                        </Button>
                      </div>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </AnimatePresence>
      </SettingsCard>

      <SettingsModal
        open={restoreTarget !== null}
        role="alertdialog"
        labelledBy="restore-heading"
        onClose={() => !restoring && setRestoreTarget(null)}
        autoFocusSelector="[data-restore-cancel]"
      >
        <h2 id="restore-heading" className="font-display text-2xl font-semibold tracking-tight">
          Go back to {restoreTarget ? formatDateTime(restoreTarget.at) : 'this point'}?
        </h2>
        <p className="mt-3 text-sm text-ink-soft">
          Replace all local data, disconnect AI and restore this point? A connected AI&apos;s local
          conversation is cleared only after the restore succeeds.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            data-restore-cancel
            variant="ghost"
            onClick={() => setRestoreTarget(null)}
            disabled={restoring}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={restoring}
            onClick={() => restoreTarget && void handleRestore(restoreTarget.id)}
          >
            {restoring ? 'Restoring…' : 'Restore'}
          </Button>
        </div>
      </SettingsModal>
    </>
  );
}
