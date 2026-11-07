import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import type { BackupSnapshot } from '@lacuna/core/db/types';
import { InlineSettingsDisclosure } from './InlineSettingsDisclosure';
import { BackupHero } from './BackupHero';
import { SettingsModal } from './SettingsModal';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import {
  AlertIcon,
  BookIcon,
  CardsIcon,
  CheckIcon,
  FileTextIcon,
  FolderIcon,
  RestoreIcon,
} from '../../components/ui/icons';
import { motionTransition } from '../../components/ui/motion';
import { useToast } from '../../components/ui/Toast';
import {
  backupFolderName,
  chooseBackupFolder,
  clearBackupFolder,
  folderMirrorSupported,
  type FolderMirrorResult,
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
  const [mirror, setMirror] = useState<FolderMirrorResult | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    try {
      const { takeAutoBackup } = await import('../../db/backups');
      // Forced: a deliberate click must not be swallowed by the automatic-save throttle.
      setMirror(null);
      await takeAutoBackup(true, setMirror);
      return true;
    } catch {
      notify('Could not save a restore point.', 'negative');
      return false;
    } finally {
      setSaving(false);
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
    setFolderError(null);
    try {
      const name = await chooseBackupFolder();
      setFolder(name);
      setMirror(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFolderError('Could not choose the folder. Try again.');
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

  function renderRestorePoint(backup: BackupSnapshot) {
    const questionCount =
      (backup.payload?.questions?.length ?? 0) +
      (backup.payload?.questionSets?.reduce((count, set) => count + set.questions.length, 0) ?? 0);
    return (
      <motion.li
        key={backup.id}
        layout={motionMultiplier > 0 ? 'position' : undefined}
        initial={motionMultiplier > 0 ? { opacity: 0, y: -4 } : false}
        animate={{ opacity: 1, y: 0 }}
        exit={motionMultiplier > 0 ? { opacity: 0, y: -4 } : undefined}
        transition={motionTransition('feedback', motionMultiplier)}
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-paper px-3 py-2"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{formatDateTime(backup.createdAt)}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
            {(
              [
                [BookIcon, backup.deckCount, 'lesson'],
                [CardsIcon, backup.cardCount, 'card'],
                [FileTextIcon, questionCount, 'question'],
              ] as const
            ).map(([Icon, count, noun]) => {
              const label = `${count} ${noun}${count === 1 ? '' : 's'}`;
              return (
                <span
                  key={noun}
                  aria-label={label}
                  title={label}
                  className="inline-flex items-center gap-1"
                >
                  <Icon width={14} height={14} />
                  {count}
                </span>
              );
            })}
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
            onConfirm={() => {
              if (backup.id === null || backup.id === undefined) return;
              void handleDelete(backup.id);
            }}
          />
        ) : (
          <div className="flex items-center gap-2">
            <Button
              ref={(button) => {
                if (backup.id === null || backup.id === undefined || !button) return;
                const id = backup.id;
                deleteButtons.current.set(id, button);
                return () => {
                  if (deleteButtons.current.get(id) === button) deleteButtons.current.delete(id);
                };
              }}
              variant="ghost"
              size="sm"
              onClick={() =>
                setConfirmDelete(backup.id !== null && backup.id !== undefined ? backup.id : null)
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
    );
  }

  const subtleRow = 'rounded-2xl bg-paper px-4 py-3';

  return (
    <>
      <BackupHero ref={backupNowButton} lastAt={lastAt} onBackUp={handleBackupNow}>
        {supportsPersistenceRequest && persistence && (
          <div className={subtleRow}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">
                  {persistence.persisted ? 'Storage is persisted' : 'Storage is not persisted'}
                </div>
                <p
                  className="text-xs text-ink-soft"
                  role={persistence.supported && !persistence.persisted ? 'note' : undefined}
                  aria-label={
                    persistence.supported && !persistence.persisted ? 'Browser storage' : undefined
                  }
                >
                  {persistence.supported ? (
                    <>
                      {persistence.persisted ? (
                        'The browser will not delete this data under storage pressure.'
                      ) : (
                        <>
                          This browser may clear Lacuna’s data, for example on shared or
                          school-managed devices. Keep a copy with{' '}
                          <a
                            className="text-accent-ink underline"
                            href="#/settings#settings-backups"
                          >
                            Backups
                          </a>{' '}
                          or{' '}
                          <a className="text-accent-ink underline" href="#/settings#settings-sync">
                            Device sync
                          </a>
                          .
                        </>
                      )}
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
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <FolderIcon width={16} height={16} />
                  Folder copy · {folder ?? 'Not configured'}
                </div>
                {mirror?.state === 'saved' ? (
                  <p role="status" className="mt-1 flex items-center gap-1.5 text-xs text-positive">
                    <CheckIcon width={14} height={14} />
                    Copied {formatDateTime(mirror.at)}
                  </p>
                ) : mirror?.state === 'failed' || mirror?.state === 'permission-denied' ? (
                  <p
                    role="alert"
                    className="mt-1 flex items-center gap-1.5 text-xs text-warning-fg"
                  >
                    <AlertIcon width={14} height={14} />
                    {mirror.state === 'permission-denied'
                      ? 'Folder permission needed. Choose the folder again.'
                      : 'Folder copy failed. Your restore point is saved.'}
                  </p>
                ) : (
                  <p className="text-xs text-ink-soft">Survives clearing browser data.</p>
                )}
                {folderError && (
                  <p role="alert" className="mt-1 text-xs text-negative">
                    {folderError}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  onClick={handleChooseFolder}
                >
                  Choose folder
                </Button>
                {folder && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={async () => {
                      await clearBackupFolder();
                      setFolder(null);
                      setMirror(null);
                      setFolderError(null);
                      notify('Folder mirroring stopped.', 'neutral');
                    }}
                  >
                    Stop mirroring
                  </Button>
                )}
              </div>
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
              layout={motionMultiplier > 0 ? 'position' : undefined}
              animate={{ opacity: 1, y: 0 }}
              exit={motionMultiplier > 0 ? { opacity: 0, y: -4 } : undefined}
              transition={motionTransition('feedback', motionMultiplier)}
              className="flex flex-col gap-2"
            >
              <AnimatePresence initial={false} mode="popLayout" propagate>
                {backups.slice(0, 3).map(renderRestorePoint)}
              </AnimatePresence>
            </motion.ul>
          )}
        </AnimatePresence>
        {backups && backups.length > 3 && (
          <InlineSettingsDisclosure
            className="mt-2"
            header="More"
            label="More restore points"
            headerClassName="flex min-h-11 items-center justify-between gap-3 rounded-lg text-sm font-semibold text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          >
            <ul className="flex flex-col gap-2 pt-2">
              <AnimatePresence initial={false} mode="popLayout" propagate>
                {backups.slice(3).map(renderRestorePoint)}
              </AnimatePresence>
            </ul>
          </InlineSettingsDisclosure>
        )}
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
