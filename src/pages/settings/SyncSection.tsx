import { useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import QRCode from 'react-qr-code';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { ClockIcon, CloseIcon, QrCodeIcon, ShareIcon, TrashIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { readSyncState } from '../../db/mutationStamp';
import type { SyncState } from '../../db/types';
import { formatDateTime, formatRelativeTime } from '../../utils/datetime';
import {
  deleteChannel,
  encodePairingCode,
  setupFirstDevice,
  syncWithPassphrase,
  unpair,
  unlockSyncState,
  joinFromPairingCode,
  joinWithPassphrase,
  validateRecoveryPassphrase,
  type PairingPayload,
  type PairingSession,
  type SyncCredentials,
} from '../../sync/pairing';
import { SyncField } from './SyncField';
import { SyncPairingFlow, type SyncPairingBusy, type SyncPairingMode } from './SyncPairingFlow';

type PairingMode = 'idle' | SyncPairingMode;
type BusyAction = 'setup' | 'join' | 'sync' | 'unpair' | 'delete' | null;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatBytes(bytes: number | undefined): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

function StatusPanel({ state }: { state: SyncState }) {
  const encrypted = formatBytes(state.lastSnapshotBytes);
  const plaintext = formatBytes(state.lastSnapshotPlaintextBytes);
  return (
    <div className="mb-5 rounded-xl border border-line bg-surface-raised/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-positive">
          <span className="h-2 w-2 rounded-full bg-positive" aria-hidden="true" />
          Paired to a sync channel
        </div>
        <span className="font-mono text-[11px] text-ink-faint">
          {state.channelId ? `${state.channelId.slice(0, 8)}…` : 'channel unavailable'}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
        <span>{state.relayUrl ?? 'Relay not recorded'}</span>
        {state.lastSuccessfulSyncAt ? (
          <span title={formatDateTime(state.lastSuccessfulSyncAt)}>
            Last synced {formatRelativeTime(state.lastSuccessfulSyncAt)}
          </span>
        ) : (
          <span>Not synced yet</span>
        )}
      </div>
      {(encrypted || plaintext) && (
        <p className="mt-2 text-xs text-ink-faint">
          Last snapshot: {encrypted ? `${encrypted} encrypted` : 'encrypted size unknown'}
          {plaintext ? ` · ${plaintext} before encryption` : ''}
        </p>
      )}
      {state.lastError && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative"
        >
          {state.lastError}
        </p>
      )}
    </div>
  );
}

export function SyncSection() {
  const { notify } = useToast();
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<PairingMode>('idle');
  const [busy, setBusy] = useState<BusyAction>(null);
  const [unlocked, setUnlocked] = useState<SyncCredentials | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionPassphrase, setActionPassphrase] = useState('');
  const qrPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void readSyncState()
      .then((state) => {
        if (!active) return;
        setSyncState(state ?? null);
        setLoaded(true);
      })
      .catch((error) => {
        if (!active) return;
        setLoaded(true);
        notify(errorMessage(error, 'Could not read sync status.'), 'negative');
      });
    return () => {
      active = false;
    };
  }, [notify]);

  useEffect(() => {
    if (!showQr) return;
    qrPanelRef.current?.focus();
    const hide = () => setShowQr(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') hide();
    };
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [showQr]);

  async function refreshState(): Promise<SyncState | null> {
    const next = await readSyncState();
    setSyncState(next ?? null);
    return next ?? null;
  }

  function beginSetup() {
    setMode('setup');
    setConfirmDelete(false);
    setConfirmUnpair(false);
  }

  function beginJoin() {
    setMode('join');
    setConfirmDelete(false);
    setConfirmUnpair(false);
  }

  function cancelFlow() {
    setMode('idle');
  }

  function applySession(session: PairingSession) {
    setSyncState(session.state);
    setUnlocked(session.credentials);
    setActionPassphrase('');
    setMode('idle');
    setShowQr(false);
    setConfirmDelete(false);
    setConfirmUnpair(false);
  }

  async function handleSetup(relayUrl: string, mintSecret: string, passphrase: string) {
    setBusy('setup');
    try {
      const session = await setupFirstDevice(relayUrl, mintSecret, passphrase);
      applySession(session);
      notify('Sync is ready. Pair another device with the QR code.', 'positive');
    } catch (error) {
      await refreshState().catch(() => undefined);
      notify(errorMessage(error, 'Could not set up sync.'), 'negative');
    } finally {
      setBusy(null);
    }
  }

  async function handleManualJoin(relayUrl: string, channelId: string, passphrase: string) {
    setBusy('join');
    try {
      const session = await joinWithPassphrase(relayUrl, channelId, passphrase);
      applySession(session);
      notify('This device is now paired.', 'positive');
    } catch (error) {
      await refreshState().catch(() => undefined);
      notify(errorMessage(error, 'Could not join the sync channel.'), 'negative');
    } finally {
      setBusy(null);
    }
  }

  async function handleQrJoin(payload: PairingPayload, passphrase: string) {
    setBusy('join');
    try {
      const session = await joinFromPairingCode(payload, passphrase);
      applySession(session);
      notify('This device is now paired.', 'positive');
    } catch (error) {
      await refreshState().catch(() => undefined);
      notify(errorMessage(error, 'Could not join from this QR code.'), 'negative');
    } finally {
      setBusy(null);
    }
  }

  async function handleSync() {
    if (!syncState) return;
    const passphraseError = validateRecoveryPassphrase(actionPassphrase);
    if (passphraseError) {
      notify(passphraseError, 'negative');
      return;
    }
    setBusy('sync');
    try {
      const session = await syncWithPassphrase(syncState, actionPassphrase);
      applySession(session);
      notify(session.result.pushed ? 'Sync complete.' : 'Already up to date.', 'positive');
    } catch (error) {
      await refreshState().catch(() => undefined);
      notify(errorMessage(error, 'Sync could not be completed.'), 'negative');
    } finally {
      setBusy(null);
    }
  }

  async function handleRevealQr() {
    if (!syncState) return;
    if (!unlocked) {
      const passphraseError = validateRecoveryPassphrase(actionPassphrase);
      if (passphraseError) {
        notify(passphraseError, 'negative');
        return;
      }
    }
    try {
      const credentials = unlocked ?? (await unlockSyncState(syncState, actionPassphrase));
      setUnlocked(credentials);
      setActionPassphrase('');
      setShowQr(true);
    } catch (error) {
      notify(errorMessage(error, 'Could not unlock the pairing QR code.'), 'negative');
    }
  }

  async function handleUnpair() {
    setBusy('unpair');
    try {
      await unpair();
      setSyncState(null);
      setUnlocked(null);
      setActionPassphrase('');
      setConfirmUnpair(false);
      setShowQr(false);
      notify('This device has been unpaired. The shared channel remains available.', 'positive');
    } catch (error) {
      notify(errorMessage(error, 'Could not unpair this device.'), 'negative');
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteChannel() {
    if (!syncState) return;
    const passphraseError = validateRecoveryPassphrase(actionPassphrase);
    if (passphraseError) {
      notify(passphraseError, 'negative');
      return;
    }
    setBusy('delete');
    try {
      await deleteChannel(syncState, actionPassphrase);
      setSyncState(null);
      setUnlocked(null);
      setActionPassphrase('');
      setConfirmDelete(false);
      setShowQr(false);
      notify('The sync channel was deleted for every device.', 'positive');
    } catch (error) {
      notify(errorMessage(error, 'Could not delete the sync channel.'), 'negative');
    } finally {
      setBusy(null);
    }
  }

  const qrValue = unlocked ? encodePairingCode(unlocked) : '';
  const pairingBusy: SyncPairingBusy = busy === 'setup' || busy === 'join' ? busy : null;

  return (
    <section id="settings-sync" className="mb-8 rounded-2xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center gap-2 text-accent">
        <ShareIcon width={18} height={18} />
        <h2 className="font-display text-xl">Device sync</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        Keep courses, cards and review history aligned across your devices. The relay stores only
        encrypted data; your recovery passphrase never leaves this device.
      </p>

      {!loaded ? (
        <p className="text-sm text-ink-faint">Reading sync status…</p>
      ) : syncState ? (
        <>
          <StatusPanel state={syncState} />
          <div className="mb-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void handleSync()} disabled={busy !== null}>
              <ClockIcon width={18} height={18} />
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleRevealQr()}
              disabled={busy !== null}
            >
              <QrCodeIcon width={18} height={18} />
              Show pairing QR
            </Button>
          </div>

          <div className="mb-5 rounded-xl border border-line bg-surface-raised/30 p-4">
            <SyncField
              id="sync-action-passphrase"
              label="Recovery passphrase"
              value={actionPassphrase}
              onChange={setActionPassphrase}
              type="password"
              autoComplete="current-password"
              placeholder="Needed to sync, show the QR or delete the channel"
            />
            <p className="mt-2 text-xs text-ink-faint">
              This is used locally to open the encrypted recovery key. It is never sent to Lacuna.
            </p>
          </div>

          {showQr && qrValue && (
            <motion.div
              ref={qrPanelRef}
              tabIndex={-1}
              role="dialog"
              aria-label="Sync pairing QR code"
              onBlur={(event) => {
                const next = event.relatedTarget as Node | null;
                if (!next || !event.currentTarget.contains(next)) setShowQr(false);
              }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16 }}
              className="mb-5 rounded-xl border border-accent/40 bg-accent-soft/30 p-5 outline-none"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg">Pair another device</h3>
                  <p className="text-xs text-ink-soft">
                    Show this only while the other device is ready to scan.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Hide pairing QR"
                  onClick={() => setShowQr(false)}
                >
                  <CloseIcon width={16} height={16} />
                </Button>
              </div>
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-xl border border-line bg-white p-4">
                  <QRCode
                    value={qrValue}
                    size={256}
                    level="L"
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
                <p className="max-w-sm text-center text-xs text-ink-faint">
                  This QR contains the channel access key. It is not a backup and should not be
                  shared publicly.
                </p>
              </div>
            </motion.div>
          )}

          <div className="border-t border-line pt-5">
            <h3 className="mb-2 font-display text-base">Leave this channel</h3>
            <p className="mb-4 text-sm text-ink-soft">
              Unpairing removes sync details from this device only. Deleting the channel removes the
              encrypted relay data for every paired device.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {confirmUnpair ? (
                <ConfirmInline
                  message="Remove sync from this device?"
                  confirmLabel={busy === 'unpair' ? 'Removing…' : 'Unpair'}
                  onCancel={() => setConfirmUnpair(false)}
                  onConfirm={() => void handleUnpair()}
                  variant="default"
                />
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => setConfirmUnpair(true)}
                  disabled={busy !== null}
                >
                  Unpair this device
                </Button>
              )}
              {confirmDelete ? (
                <ConfirmInline
                  message="Delete the shared channel everywhere?"
                  confirmLabel={busy === 'delete' ? 'Deleting…' : 'Delete channel'}
                  onCancel={() => setConfirmDelete(false)}
                  onConfirm={() => void handleDeleteChannel()}
                />
              ) : (
                <Button
                  variant="danger"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy !== null}
                >
                  <TrashIcon width={16} height={16} />
                  Delete channel
                </Button>
              )}
            </div>
          </div>
        </>
      ) : mode === 'setup' || mode === 'join' ? (
        <SyncPairingFlow
          mode={mode}
          busy={pairingBusy}
          onSetup={(relayUrl, mintSecret, passphrase) =>
            void handleSetup(relayUrl, mintSecret, passphrase)
          }
          onManualJoin={(relayUrl, channelId, passphrase) =>
            void handleManualJoin(relayUrl, channelId, passphrase)
          }
          onQrJoin={(payload, passphrase) => void handleQrJoin(payload, passphrase)}
          onCancel={cancelFlow}
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface-raised/30 p-4">
          <h3 className="mb-1 font-display text-lg">Keep this device in step</h3>
          <p className="mb-4 text-sm text-ink-soft">
            Pair this installation with another device. Sync is deliberate for now; automatic focus
            and session-end triggers arrive in the next phase.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={beginSetup}>
              <ShareIcon width={18} height={18} />
              Set up sync
            </Button>
            <Button variant="secondary" onClick={beginJoin}>
              <QrCodeIcon width={18} height={18} />
              Join another device
            </Button>
          </div>
        </div>
      )}

      {syncState === null && mode === 'idle' && (
        <p className="mt-4 text-xs text-ink-faint">No sync channel is configured on this device.</p>
      )}
    </section>
  );
}
