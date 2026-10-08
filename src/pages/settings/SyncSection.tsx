import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { ClockIcon, QrCodeIcon, ShareIcon, TrashIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { readSyncState } from '../../db/mutationStamp';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { SettingsCard } from './SettingsUi';
import { SettingsModal } from './SettingsModal';
import { loadQrCode, SyncQrPanel } from './SyncQrPanel';
import type { SyncState } from '../../db/types';
import { formatDateTime, formatRelativeTime } from '../../utils/datetime';
import type { PairingPayload, PairingSession } from '../../sync/pairing';
import {
  forgetRememberedCredentials,
  readRememberedCredentials,
  type SyncCredentials,
} from '../../sync/credentials';
import { validateRecoveryPassphrase } from '../../sync/pairingConfig';
import { loadSyncPairing } from '../../sync/loaders';
import { allowRelayConnect } from '../../sync/csp';
import { clearUnlockedCredentials, publishUnlockedCredentials } from '../../sync/triggers';
import { SyncField } from './SyncField';
import type { SyncPairingBusy, SyncPairingMode } from './SyncPairingFlow';

const loadSyncPairingFlow = () =>
  import('./SyncPairingFlow').then((module) => ({ default: module.SyncPairingFlow }));
const SyncPairingFlow = lazy(loadSyncPairingFlow);

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
    <div className="rounded-2xl bg-paper px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-positive">
          <span className="h-2 w-2 rounded-full bg-positive" aria-hidden="true" />
          Paired to a sync channel
        </div>
        {state.lastSuccessfulSyncAt ? (
          <span
            className="text-sm text-ink-soft"
            title={formatDateTime(state.lastSuccessfulSyncAt)}
          >
            Last synced {formatRelativeTime(state.lastSuccessfulSyncAt)}
          </span>
        ) : (
          <span className="text-sm text-ink-soft">Not synced yet</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-faint">
        <span>{state.relayUrl ?? 'Relay not recorded'}</span>
        <span>{state.channelId ? `${state.channelId.slice(0, 8)}…` : 'channel unavailable'}</span>
        {(encrypted || plaintext) && (
          <span>
            Last snapshot: {encrypted ? `${encrypted} encrypted` : 'encrypted size unknown'}
            {plaintext ? ` · ${plaintext} before encryption` : ''}
          </span>
        )}
      </div>
      {state.lastError && (
        <p role="alert" className="mt-3 rounded-xl bg-negative/10 px-3 py-2 text-sm text-negative">
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
  const [pairOpen, setPairOpen] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [unlocked, setUnlocked] = useState<SyncCredentials | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrValue, setQrValue] = useState('');
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
        setUnlocked(readRememberedCredentials(state ?? undefined));
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
    const hide = () => {
      setShowQr(false);
      setQrValue('');
    };
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

  useEffect(() => {
    publishUnlockedCredentials(unlocked);
  }, [unlocked]);

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

  function closePair() {
    setPairOpen(false);
    setMode('idle');
  }

  function hideQr() {
    setShowQr(false);
    setQrValue('');
  }

  function preparePairingFlow() {
    // Preloading is opportunistic. The page boundary performs the real retry
    // with a reload if the module loader retains a failed chunk request.
    void loadSyncPairingFlow().catch(() => undefined);
  }

  function preparePairingActions() {
    void loadSyncPairing().catch(() => undefined);
  }

  function prepareQr() {
    void Promise.all([loadSyncPairing(), loadQrCode()]).catch(() => undefined);
  }

  function applySession(session: PairingSession) {
    setSyncState(session.state);
    setUnlocked(session.credentials);
    setActionPassphrase('');
    setMode('idle');
    setPairOpen(false);
    setShowQr(false);
    setQrValue('');
    setConfirmDelete(false);
    setConfirmUnpair(false);
  }

  async function handleSetup(relayUrl: string, mintSecret: string, passphrase: string) {
    setBusy('setup');
    try {
      const { setupFirstDevice } = await loadSyncPairing();
      allowRelayConnect(relayUrl);
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
      const { joinWithPassphrase } = await loadSyncPairing();
      allowRelayConnect(relayUrl);
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
      const { joinFromPairingCode } = await loadSyncPairing();
      allowRelayConnect(payload.relayUrl);
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
    const isUnlocked =
      unlocked !== null &&
      syncState.channelId === unlocked.channelId &&
      (syncState.relayUrl ?? '') === (unlocked.relayUrl ?? '');
    if (isUnlocked) {
      setBusy('sync');
      try {
        const { syncWithCredentials } = await loadSyncPairing();
        if (syncState.relayUrl) allowRelayConnect(syncState.relayUrl);
        const session = await syncWithCredentials(unlocked);
        applySession(session);
        notify(session.result.pushed ? 'Sync complete.' : 'Already up to date.', 'positive');
      } catch (error) {
        await refreshState().catch(() => undefined);
        notify(errorMessage(error, 'Sync could not be completed.'), 'negative');
      } finally {
        setBusy(null);
      }
      return;
    }
    const passphraseError = validateRecoveryPassphrase(actionPassphrase);
    if (passphraseError) {
      notify(passphraseError, 'negative');
      return;
    }
    setBusy('sync');
    try {
      const { syncWithPassphrase } = await loadSyncPairing();
      if (syncState.relayUrl) allowRelayConnect(syncState.relayUrl);
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
      const { encodePairingCode, unlockSyncState } = await loadSyncPairing();
      const credentials = unlocked ?? (await unlockSyncState(syncState, actionPassphrase));
      setUnlocked(credentials);
      setActionPassphrase('');
      setQrValue(encodePairingCode(credentials));
      setShowQr(true);
    } catch (error) {
      notify(errorMessage(error, 'Could not unlock the pairing QR code.'), 'negative');
    }
  }

  async function handleCopyPairingLink() {
    if (!qrValue) return;
    try {
      await navigator.clipboard.writeText(qrValue);
      notify('Pairing link copied.', 'positive');
    } catch {
      notify('Could not copy the pairing link.', 'negative');
    }
  }

  async function handleLock() {
    clearUnlockedCredentials();
    try {
      await forgetRememberedCredentials();
      setUnlocked(null);
      setActionPassphrase('');
    } catch (error) {
      publishUnlockedCredentials(unlocked);
      notify(errorMessage(error, 'Could not lock this device.'), 'negative');
    }
  }

  async function handleUnpair() {
    setBusy('unpair');
    try {
      const { unpair } = await loadSyncPairing();
      await unpair();
      setSyncState(null);
      setUnlocked(null);
      setActionPassphrase('');
      setConfirmUnpair(false);
      setShowQr(false);
      setQrValue('');
      notify('This device has been unpaired. The shared channel remains available.', 'positive');
    } catch (error) {
      notify(errorMessage(error, 'Could not unpair this device.'), 'negative');
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteChannel() {
    if (!syncState) return;
    if (!unlocked) {
      const passphraseError = validateRecoveryPassphrase(actionPassphrase);
      if (passphraseError) {
        notify(passphraseError, 'negative');
        return;
      }
    }
    setBusy('delete');
    try {
      const { deleteChannel } = await loadSyncPairing();
      if (syncState.relayUrl) allowRelayConnect(syncState.relayUrl);
      await deleteChannel(syncState, unlocked ?? actionPassphrase);
      setSyncState(null);
      setUnlocked(null);
      setActionPassphrase('');
      setConfirmDelete(false);
      setShowQr(false);
      setQrValue('');
      notify('The sync channel was deleted for every device.', 'positive');
    } catch (error) {
      notify(errorMessage(error, 'Could not delete the sync channel.'), 'negative');
    } finally {
      setBusy(null);
    }
  }

  const pairingBusy: SyncPairingBusy = busy === 'setup' || busy === 'join' ? busy : null;

  return (
    <SettingsCard id="settings-sync">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink"
        >
          <ShareIcon width={18} height={18} />
        </span>
        <div className="min-w-0 flex-1">
          <SettingsSectionHeading className="inline font-display text-lg font-semibold tracking-tight">
            Another device
          </SettingsSectionHeading>
          <span className="text-sm text-ink-faint"> · End-to-end encrypted</span>
        </div>
        {!loaded ? (
          <span className="text-sm text-ink-faint">Reading sync status…</span>
        ) : syncState ? (
          confirmUnpair ? (
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
              size="sm"
              onClick={() => setConfirmUnpair(true)}
              disabled={busy !== null}
            >
              Remove
            </Button>
          )
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPairOpen(true)}
            onPointerEnter={preparePairingFlow}
            onFocus={preparePairingFlow}
            onPointerDown={preparePairingFlow}
          >
            Pair
          </Button>
        )}
      </div>

      {loaded && syncState && (
        <div className="mt-5 flex flex-col gap-4">
          <StatusPanel state={syncState} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => void handleSync()}
              onPointerEnter={preparePairingActions}
              onFocus={preparePairingActions}
              onPointerDown={preparePairingActions}
              disabled={busy !== null}
            >
              <ClockIcon width={18} height={18} />
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleRevealQr()}
              onPointerEnter={prepareQr}
              onFocus={prepareQr}
              onPointerDown={prepareQr}
              disabled={busy !== null}
            >
              <QrCodeIcon width={18} height={18} />
              Show pairing QR
            </Button>
          </div>

          {unlocked ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-positive/10 px-4 py-2">
              <p className="text-sm text-positive">
                Unlocked — this device remembers its key, so sync works without the passphrase.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleLock()}
                disabled={busy !== null}
              >
                Lock
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl bg-paper p-4">
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
          )}

          {showQr && qrValue && (
            <SyncQrPanel
              panelRef={qrPanelRef}
              qrValue={qrValue}
              onHide={hideQr}
              onCopy={() => void handleCopyPairingLink()}
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
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
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={busy !== null}
              >
                <TrashIcon width={16} height={16} />
                Delete channel
              </Button>
            )}
          </div>
        </div>
      )}

      <SettingsModal
        open={pairOpen && !syncState}
        labelledBy="sync-pair-heading"
        onClose={closePair}
        wide={mode !== 'idle'}
      >
        <h2
          id="sync-pair-heading"
          className="mb-4 font-display text-2xl font-semibold tracking-tight"
        >
          Pair this device
        </h2>
        {mode === 'setup' || mode === 'join' ? (
          <Suspense fallback={<p className="text-sm text-ink-faint">Preparing sync setup…</p>}>
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
          </Suspense>
        ) : (
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
        )}
      </SettingsModal>
    </SettingsCard>
  );
}
