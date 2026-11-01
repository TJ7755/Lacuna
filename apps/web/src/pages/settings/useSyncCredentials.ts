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

  function hideQr() {
    setShowQr(false);
    setQrValue('');
  }

  async function handleRevealQr() {
    if (!syncState) return;
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
      const credentials = unlocked ?? (await unlockSyncState(syncState, actionPassphrase));
      setUnlocked(credentials);
      setActionPassphrase('');
      setQrValue(encodePairingCode(credentials));
      setShowQr(true);
    } catch (error) {
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
    clearUnlockedCredentials();
    try {
      await forgetRememberedCredentials();
      setUnlocked(null);
      setActionPassphrase('');
    } catch (error) {
      publishUnlockedCredentials(unlocked);
      notify(error instanceof Error ? error.message : 'Could not lock this device.', 'negative');
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
    if (!qrValue) return;
    if (showQr) qrPanelRef.current?.focus();
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
  }, [showQr, qrValue, qrPanelRef, setShowQr, setQrValue]);

  useEffect(() => {
    publishUnlockedCredentials(unlocked);
  }, [unlocked]);
}
