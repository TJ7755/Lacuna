import { useEffect, useRef, useState } from 'react';
import type { useToast } from '../../components/ui/Toast';
import type { SyncState } from '@lacuna/core/db/types';
import { forgetRememberedCredentials, type SyncCredentials } from '../../sync/credentials';
import { loadSyncPairing } from '../../sync/loaders';
import { validateRecoveryPassphrase } from '../../sync/pairingConfig';
import { clearUnlockedCredentials, publishUnlockedCredentials } from '../../sync/triggers';
import type { useSyncFeedback } from './useSyncFeedback';

export function useSyncCredentials({
  syncState,
  actionPassphrase,
  setActionPassphrase,
  feedback,
  notify,
}: {
  syncState: SyncState | null;
  actionPassphrase: string;
  setActionPassphrase: (value: string) => void;
  feedback: ReturnType<typeof useSyncFeedback>;
  notify: ReturnType<typeof useToast>['notify'];
}) {
  const [unlocked, setUnlocked] = useState<SyncCredentials | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrValue, setQrValue] = useState('');
  const qrPanelRef = useRef<HTMLDivElement>(null);
  const revealGeneration = useRef(0);
  const locking = useRef(false);

  function hideQr() {
    revealGeneration.current += 1;
    setShowQr(false);
    setQrValue('');
  }

  useEffect(() => {
    // Privacy cancellation also fences an unlock which has not produced a QR yet.
    const hide = () => {
      revealGeneration.current += 1;
      setShowQr(false);
      setQrValue('');
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') hide();
    };
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      revealGeneration.current += 1;
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [syncState]);

  async function handleRevealQr() {
    if (!syncState || locking.current) return;
    const generation = ++revealGeneration.current;
    feedback.begin();
    if (!unlocked) {
      const passphraseError = validateRecoveryPassphrase(actionPassphrase);
      if (passphraseError) {
        feedback.fail(new Error(passphraseError), 'Enter a recovery passphrase.');
        return;
      }
    }
    try {
      const { encodePairingCode, unlockSyncState } = await loadSyncPairing();
      if (generation !== revealGeneration.current) return;
      const credentials = unlocked ?? (await unlockSyncState(syncState, actionPassphrase));
      if (generation !== revealGeneration.current) return;
      setUnlocked(credentials);
      setActionPassphrase('');
      setQrValue(encodePairingCode(credentials));
      setShowQr(true);
    } catch (error) {
      if (generation === revealGeneration.current)
        feedback.fail(error, 'Could not unlock the pairing QR code. Try again.');
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
    if (locking.current) return;
    locking.current = true;
    hideQr();
    setUnlocked(null);
    setActionPassphrase('');
    clearUnlockedCredentials();
    try {
      await forgetRememberedCredentials();
    } catch (error) {
      setUnlocked(unlocked);
      publishUnlockedCredentials(unlocked);
      notify(error instanceof Error ? error.message : 'Could not lock this device.', 'negative');
    } finally {
      locking.current = false;
    }
  }

  return {
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
  };
}

export function useSyncCredentialPrivacy({
  unlocked,
  showQr,
  qrValue,
  qrPanelRef,
  setShowQr,
  setQrValue,
}: Pick<
  ReturnType<typeof useSyncCredentials>,
  'unlocked' | 'showQr' | 'qrValue' | 'qrPanelRef' | 'setShowQr' | 'setQrValue'
>) {
  useEffect(() => {
    if (showQr) qrPanelRef.current?.focus();
  }, [showQr, qrValue, qrPanelRef, setShowQr, setQrValue]);

  useEffect(() => {
    publishUnlockedCredentials(unlocked);
  }, [unlocked]);
}
