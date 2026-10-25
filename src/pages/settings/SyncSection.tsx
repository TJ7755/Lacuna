import { useSyncCredentials, useSyncCredentialPrivacy } from './useSyncCredentials';
import { useEffect, useState } from 'react';
import { AnimatedDisclosure } from '../../components/ui/AnimatedDisclosure';
import { Button } from '../../components/ui/Button';
import { ConfirmInlineSwap } from '../../components/ui/ConfirmInline';
import { useToast } from '../../components/ui/Toast';
import { ClockIcon, QrCodeIcon, ShareIcon, TrashIcon, UnlockIcon } from '../../components/ui/icons';
import { readSyncState } from '../../db/mutationStamp';
import type { SyncState } from '../../db/types';
import { readRememberedCredentials } from '../../sync/credentials';
import { allowRelayConnect } from '../../sync/csp';
import { loadSyncPairing } from '../../sync/loaders';
import type { PairingPayload, PairingSession } from '../../sync/pairing';
import { validateRecoveryPassphrase } from '../../sync/pairingConfig';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { SettingsCard } from './SettingsUi';
import { SyncField } from './SyncField';
import type { SyncPairingBusy, SyncPairingMode } from './SyncPairingFlow';
import { SyncPairingModal, loadSyncPairingFlow } from './SyncPairingModal';
import { SyncQrPanel, loadQrCode } from './SyncQrPanel';
import { StatusPanel, SyncDetails } from './SyncStatus';
import { useSyncFeedback } from './useSyncFeedback';

type PairingMode = 'idle' | SyncPairingMode;
type BusyAction = 'setup' | 'join' | 'sync' | 'unpair' | 'delete' | null;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function SyncSection() {
  const { notify } = useToast();
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<PairingMode>('idle');
  const [pairOpen, setPairOpen] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionPassphrase, setActionPassphrase] = useState('');
  const feedback = useSyncFeedback(busy, pairOpen);

  const {
    unlocked,
    setUnlocked,
    showQr,
    setShowQr,
    qrValue,
    setQrValue,
    qrPanelRef,
    hideQr,
    handleRevealQr,
    handleCopyPairingLink,
    handleLock,
  } = useSyncCredentials({ syncState, actionPassphrase, setActionPassphrase, feedback, notify });

  useEffect(() => {
    if (pairOpen && mode === 'idle') document.getElementById('sync-begin-setup')?.focus();
  }, [pairOpen, mode]);

  useEffect(() => {
    let active = true;
    void readSyncState()
      .then((state) => {
        if (!active) return;
        setSyncState(pairedState(state));
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
  }, [notify, setUnlocked]);

  useSyncCredentialPrivacy({ unlocked, showQr, qrValue, qrPanelRef, setShowQr, setQrValue });

  async function refreshState(): Promise<SyncState | null> {
    const next = await readSyncState();
    const paired = pairedState(next);
    setSyncState(paired);
    return paired;
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
    feedback.begin();
    setBusy('setup');
    try {
      const { setupFirstDevice } = await loadSyncPairing();
      allowRelayConnect(relayUrl);
      const session = await setupFirstDevice(relayUrl, mintSecret, passphrase);
      applySession(session);
      feedback.complete('sync-show-qr');
      notify('Sync is ready. Pair another device with the QR code.', 'positive');
    } catch (error) {
      await refreshState().catch(() => undefined);
      throw error;
    } finally {
      setBusy(null);
    }
  }

  async function handleManualJoin(relayUrl: string, channelId: string, passphrase: string) {
    feedback.begin();
    setBusy('join');
    try {
      const { joinWithPassphrase } = await loadSyncPairing();
      allowRelayConnect(relayUrl);
      const session = await joinWithPassphrase(relayUrl, channelId, passphrase);
      applySession(session);
      feedback.complete('sync-now');
      notify('This device is now paired.', 'positive');
    } catch (error) {
      await refreshState().catch(() => undefined);
      throw error;
    } finally {
      setBusy(null);
    }
  }

  async function handleQrJoin(payload: PairingPayload, passphrase: string) {
    feedback.begin();
    setBusy('join');
    try {
      const { joinFromPairingCode } = await loadSyncPairing();
      allowRelayConnect(payload.relayUrl);
      const session = await joinFromPairingCode(payload, passphrase);
      applySession(session);
      feedback.complete('sync-now');
      notify('This device is now paired.', 'positive');
    } catch (error) {
      await refreshState().catch(() => undefined);
      throw error;
    } finally {
      setBusy(null);
    }
  }

  async function handleSync() {
    if (!syncState) return;
    feedback.begin();
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
      feedback.fail(new Error(passphraseError), 'Enter a recovery passphrase.');
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
      feedback.fail(error, 'Sync could not be completed. Try again.');
    } finally {
      setBusy(null);
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
          <SettingsSectionHeading className="font-display text-lg font-semibold tracking-tight">
            Another device
          </SettingsSectionHeading>
        </div>
        {!loaded ? (
          <span className="text-sm text-ink-faint">Reading sync status…</span>
        ) : !syncState ? (
          <Button
            key="pair"
            variant="secondary"
            size="sm"
            onClick={() => setPairOpen(true)}
            onPointerEnter={preparePairingFlow}
            onFocus={preparePairingFlow}
            onPointerDown={preparePairingFlow}
          >
            Pair
          </Button>
        ) : null}
      </div>

      {loaded && syncState && (
        <div className="mt-3 flex flex-col gap-5">
          <StatusPanel state={syncState} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              id="sync-now"
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
              id="sync-show-qr"
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
            {unlocked && (
              <Button
                variant="ghost"
                size="sm"
                className="px-3 text-positive"
                aria-label="Lock"
                title="Unlocked — this device remembers its key, so sync works without the passphrase."
                onClick={() => void handleLock()}
                disabled={busy !== null}
              >
                <UnlockIcon width={18} height={18} />
              </Button>
            )}
          </div>

          {!unlocked && (
            <div className="rounded-2xl bg-paper p-4">
              <SyncField
                id="sync-action-passphrase"
                label="Recovery passphrase"
                value={actionPassphrase}
                onChange={(value) => {
                  setActionPassphrase(value);
                  feedback.clear();
                }}
                error={
                  feedback.feedback?.field === 'sync-action-passphrase'
                    ? feedback.feedback.message
                    : undefined
                }
                type="password"
                autoComplete="current-password"
                placeholder="Needed to sync, show the QR or delete the channel"
              />
              <p className="mt-2 text-xs text-ink-faint">
                This is used locally to open the encrypted recovery key. It is never sent to Lacuna.
              </p>
            </div>
          )}

          {feedback.feedback && !feedback.feedback.field && (
            <p role="alert" className="text-sm text-negative">
              {feedback.feedback.message}
            </p>
          )}

          <div>
            {qrValue && (
              <AnimatedDisclosure open={showQr} initial innerClassName="pb-4">
                <SyncQrPanel
                  panelRef={qrPanelRef}
                  qrValue={qrValue}
                  onHide={hideQr}
                  onDismiss={() => setShowQr(false)}
                  onCopy={() => void handleCopyPairingLink()}
                />
              </AnimatedDisclosure>
            )}

            <div className="flex min-w-0 flex-col gap-3 border-t border-line pt-3">
              <SyncDetails state={syncState} />
              <ConfirmInlineSwap
                active={confirmUnpair || confirmDelete}
                message={
                  confirmUnpair
                    ? 'Remove sync from this device?'
                    : 'Delete the shared channel everywhere?'
                }
                confirmLabel={
                  confirmUnpair
                    ? busy === 'unpair'
                      ? 'Removing…'
                      : 'Unpair'
                    : busy === 'delete'
                      ? 'Deleting…'
                      : 'Delete channel'
                }
                onCancel={() => {
                  setConfirmUnpair(false);
                  setConfirmDelete(false);
                }}
                onConfirm={confirmUnpair ? handleUnpair : handleDeleteChannel}
                disabled={busy !== null}
                variant={confirmUnpair ? 'default' : 'destructive'}
              >
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    key="remove"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmUnpair(true)}
                    disabled={busy !== null}
                  >
                    Remove
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy !== null}
                  >
                    <TrashIcon width={16} height={16} />
                    Delete channel
                  </Button>
                </div>
              </ConfirmInlineSwap>
            </div>
          </div>
        </div>
      )}

      <SyncPairingModal
        pairOpen={pairOpen}
        syncState={syncState}
        mode={mode}
        closePair={closePair}
        pairingBusy={pairingBusy}
        handleSetup={handleSetup}
        handleManualJoin={handleManualJoin}
        handleQrJoin={handleQrJoin}
        cancelFlow={cancelFlow}
        beginSetup={beginSetup}
        beginJoin={beginJoin}
      />
    </SettingsCard>
  );
}

/** The same row also holds teacher share-link credentials; only a channel means sync is set up. */
function pairedState(state: SyncState | undefined): SyncState | null {
  return state?.channelId ? state : null;
}
