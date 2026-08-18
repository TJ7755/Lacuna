import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { CameraIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { SyncField } from './SyncField';
import {
  DEFAULT_RELAY_URL,
  decodePairingCode,
  validateRecoveryPassphrase,
  type PairingPayload,
} from '../../sync/pairing';

export type SyncPairingMode = 'setup' | 'join';
export type SyncPairingBusy = 'setup' | 'join' | null;

type JoinMode = 'qr' | 'manual';

interface SyncPairingFlowProps {
  mode: SyncPairingMode;
  busy: SyncPairingBusy;
  onSetup: (relayUrl: string, mintSecret: string, passphrase: string) => void;
  onManualJoin: (relayUrl: string, channelId: string, passphrase: string) => void;
  onQrJoin: (payload: PairingPayload, passphrase: string) => void;
  onCancel: () => void;
}

export function SyncPairingFlow({
  mode,
  busy,
  onSetup,
  onManualJoin,
  onQrJoin,
  onCancel,
}: SyncPairingFlowProps) {
  const { notify } = useToast();
  const [joinMode, setJoinMode] = useState<JoinMode>('qr');
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [mintSecret, setMintSecret] = useState('');
  const [setupPassphrase, setSetupPassphrase] = useState('');
  const [setupConfirmation, setSetupConfirmation] = useState('');
  const [manualChannelId, setManualChannelId] = useState('');
  const [manualPassphrase, setManualPassphrase] = useState('');
  const [pairingPassphrase, setPairingPassphrase] = useState('');
  const [pairingPayload, setPairingPayload] = useState<PairingPayload | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scannerElementRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    async function stop(current: Html5Qrcode): Promise<void> {
      try {
        await current.stop();
        await current.clear();
      } catch {
        // The camera may already have stopped after a successful decode.
      }
    }

    void (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled || !scannerElementRef.current) return;
        scanner = new Html5Qrcode(scannerElementRef.current.id);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            if (cancelled || !scanner) return;
            const current = scanner;
            scanner = null;
            scannerRef.current = null;
            await stop(current);
            setScanning(false);
            try {
              setPairingPayload(decodePairingCode(decodedText));
              setScanError(null);
            } catch (error) {
              setScanError(
                error instanceof Error
                  ? error.message
                  : 'This QR code is not a Lacuna sync pairing code.',
              );
            }
          },
          () => {
            // No code in this frame; keep scanning silently.
          },
        );
      } catch (error) {
        if (cancelled) return;
        scannerRef.current = null;
        setScanning(false);
        setScanError(
          error instanceof Error ? error.message : 'Could not start the camera scanner.',
        );
      }
    })();

    return () => {
      cancelled = true;
      const current = scannerRef.current;
      scannerRef.current = null;
      if (current) void stop(current);
    };
  }, [scanning]);

  function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const passphraseError = validateRecoveryPassphrase(setupPassphrase);
    if (passphraseError) {
      notify(passphraseError, 'negative');
      return;
    }
    if (setupPassphrase !== setupConfirmation) {
      notify('The recovery passphrases do not match.', 'negative');
      return;
    }
    onSetup(relayUrl, mintSecret, setupPassphrase);
  }

  function handleManualJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onManualJoin(relayUrl, manualChannelId.trim(), manualPassphrase);
  }

  function handleQrJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pairingPayload) onQrJoin(pairingPayload, pairingPassphrase);
  }

  function handleStartScan() {
    setScanError(null);
    setPairingPayload(null);
    setScanning(true);
  }

  function handleStopScan() {
    setScanning(false);
    setScanError(null);
  }

  const cameraAvailable =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  if (mode === 'setup') {
    return (
      <form onSubmit={handleSetup} className="space-y-5">
        <div>
          <h3 className="mb-1 font-display text-lg">Set up sync</h3>
          <p className="text-sm text-ink-soft">
            This device will create the private channel and publish the first encrypted snapshot.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SyncField
            id="sync-setup-relay"
            label="Relay URL"
            value={relayUrl}
            onChange={setRelayUrl}
            placeholder={DEFAULT_RELAY_URL}
          />
          <SyncField
            id="sync-mint-secret"
            label="Relay mint secret"
            value={mintSecret}
            onChange={setMintSecret}
            type="password"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SyncField
            id="sync-setup-passphrase"
            label="Recovery passphrase"
            value={setupPassphrase}
            onChange={setSetupPassphrase}
            type="password"
            autoComplete="new-password"
          />
          <SyncField
            id="sync-setup-confirmation"
            label="Confirm recovery passphrase"
            value={setupConfirmation}
            onChange={setSetupConfirmation}
            type="password"
            autoComplete="new-password"
          />
        </div>
        <p className="text-xs text-ink-faint">
          Use at least 16 characters. Choose a phrase you can recover; the relay mint secret is used
          only to create this channel and is not stored.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={busy !== null}>
            {busy === 'setup' ? 'Setting up…' : 'Set up sync'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy !== null}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h3 className="mb-1 font-display text-lg">Join another device</h3>
        <p className="text-sm text-ink-soft">
          Scan a pairing QR or enter the channel details and recovery passphrase.
        </p>
      </div>
      <div
        className="mb-5 flex gap-1 rounded-lg border border-line bg-surface-raised/30 p-1"
        role="tablist"
        aria-label="Pairing method"
      >
        <button
          type="button"
          role="tab"
          aria-selected={joinMode === 'qr'}
          onClick={() => setJoinMode('qr')}
          className={cn(
            'min-h-10 flex-1 rounded-md px-3 text-sm transition-colors',
            joinMode === 'qr' ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:text-ink',
          )}
        >
          QR code
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={joinMode === 'manual'}
          onClick={() => setJoinMode('manual')}
          className={cn(
            'min-h-10 flex-1 rounded-md px-3 text-sm transition-colors',
            joinMode === 'manual' ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:text-ink',
          )}
        >
          Enter details
        </button>
      </div>

      {joinMode === 'qr' ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={scanning ? handleStopScan : handleStartScan}
              disabled={!cameraAvailable || busy !== null}
            >
              <CameraIcon width={18} height={18} />
              {scanning ? 'Stop scanning' : 'Scan pairing QR'}
            </Button>
            {!cameraAvailable && (
              <span className="text-xs text-ink-faint">
                Camera scanning is unavailable in this browser.
              </span>
            )}
          </div>
          {scanning && (
            <div className="mb-4 rounded-xl border border-line-strong bg-black p-3">
              <div
                id="sync-qr-scanner"
                ref={scannerElementRef}
                className="mx-auto aspect-square max-w-sm overflow-hidden rounded-lg"
              />
              <p className="mt-2 text-xs text-white/70">Point the camera at the pairing QR.</p>
            </div>
          )}
          {scanError && (
            <p role="alert" className="mb-4 text-sm text-negative">
              {scanError}
            </p>
          )}
          {pairingPayload && (
            <form onSubmit={handleQrJoin} className="space-y-4">
              <div className="rounded-xl border border-line bg-surface-raised/40 px-4 py-3 text-sm text-ink-soft">
                QR read. This device will pair with{' '}
                <span className="font-mono text-xs text-ink">{pairingPayload.relayUrl}</span>.
              </div>
              <SyncField
                id="sync-qr-passphrase"
                label="Your recovery passphrase"
                value={pairingPassphrase}
                onChange={setPairingPassphrase}
                type="password"
                autoComplete="new-password"
              />
              <p className="text-xs text-ink-faint">
                Set a local recovery passphrase of at least 16 characters. It protects the recovery
                copy stored on this device.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" disabled={busy !== null}>
                  {busy === 'join' ? 'Joining…' : 'Join channel'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPairingPayload(null)}
                  disabled={busy !== null}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </>
      ) : (
        <form onSubmit={handleManualJoin} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SyncField
              id="sync-join-relay"
              label="Relay URL"
              value={relayUrl}
              onChange={setRelayUrl}
              placeholder={DEFAULT_RELAY_URL}
            />
            <SyncField
              id="sync-join-channel"
              label="Channel id"
              value={manualChannelId}
              onChange={setManualChannelId}
              placeholder="32 lowercase hexadecimal characters"
              autoComplete="off"
            />
          </div>
          <SyncField
            id="sync-join-passphrase"
            label="Recovery passphrase"
            value={manualPassphrase}
            onChange={setManualPassphrase}
            type="password"
            autoComplete="current-password"
          />
          <p className="text-xs text-ink-faint">
            The channel id is not an account name. Treat it and the recovery passphrase as private
            pairing details.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy !== null}>
              {busy === 'join' ? 'Joining…' : 'Join channel'}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
