import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import { Button } from '../../components/ui/Button';
import { SegmentedPills } from './SettingsUi';
import { useActionFocus } from '../../hooks/useActionFocus';
import { CameraIcon } from '../../components/ui/icons';
import { SyncRelayFields } from './SyncRelayFields';
import { dialogKeyDown } from '../../hooks/dialogKeys';
import { syncFeedback, focusSyncField, type SyncFeedback } from './syncFeedback';
import { SyncField } from './SyncField';
import { SettingsSubsectionHeading } from './SettingsSectionHeading';
import { DEFAULT_RELAY_URL, validateRecoveryPassphrase } from '../../sync/pairingConfig';
import type { PairingPayload } from '../../sync/pairing';
import { loadSyncPairing } from '../../sync/loaders';

export type SyncPairingMode = 'setup' | 'join';
export type SyncPairingBusy = 'setup' | 'join' | null;

type JoinMode = 'qr' | 'manual';

interface SyncPairingFlowProps {
  mode: SyncPairingMode;
  busy: SyncPairingBusy;
  onSetup: (relayUrl: string, mintSecret: string, passphrase: string) => Promise<void>;
  onManualJoin: (relayUrl: string, channelId: string, passphrase: string) => Promise<void>;
  onQrJoin: (payload: PairingPayload, passphrase: string) => Promise<void>;
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
  const [feedback, setFeedback] = useState<SyncFeedback | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);
  const methodArrow = useRef(false);
  const { remember, restore } = useActionFocus();
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
    if (methodArrow.current) {
      methodArrow.current = false;
      return;
    }
    if (mode === 'setup') focusSyncField('sync-setup-passphrase');
    else if (joinMode === 'manual') focusSyncField('sync-join-channel');
    else if (pairingPayload) focusSyncField('sync-qr-passphrase');
    else
      flowRef.current
        ?.querySelector<HTMLButtonElement>(
          '[data-scan]:not([disabled]), [role=radio][aria-checked=true]',
        )
        ?.focus();
  }, [mode, joinMode, pairingPayload]);

  function fail(next: SyncFeedback) {
    setFeedback(next);
    if (next.field?.endsWith('-relay') || next.field === 'sync-mint-secret') {
      setShowAdvanced(true);
    }
  }

  useEffect(() => {
    if (!feedback) return;
    restore(
      feedback.field
        ? document.getElementById(feedback.field)
        : (flowRef.current?.querySelector<HTMLButtonElement>('button[type=submit]') ?? null),
    );
  }, [feedback, showAdvanced, restore]);

  const fieldError = (id: string) => (feedback?.field === id ? feedback.message : undefined);
  const formError =
    feedback && !feedback.field ? (
      <p role="alert" className="text-sm text-negative">
        {feedback.message}
      </p>
    ) : null;

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
              const { decodePairingCode } = await loadSyncPairing();
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
        if (scanner) {
          await stop(scanner);
          scanner = null;
        }
        scannerRef.current = null;
        if (cancelled) return;
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

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    remember();
    setFeedback(null);
    const passphraseError = validateRecoveryPassphrase(setupPassphrase);
    if (passphraseError) {
      fail({ message: passphraseError, field: 'sync-setup-passphrase' });
      return;
    }
    if (setupPassphrase !== setupConfirmation) {
      fail({ message: 'The recovery passphrases do not match.', field: 'sync-setup-confirmation' });
      return;
    }
    try {
      await onSetup(relayUrl, mintSecret, setupPassphrase);
    } catch (error) {
      fail(syncFeedback(error, 'Could not set up sync. Try again.', 'sync-setup'));
    }
  }

  async function handleManualJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    remember();
    setFeedback(null);
    if (!/^[0-9a-f]{32}$/.test(manualChannelId.trim())) {
      fail({
        message: 'Enter the 32-character channel id from your other device.',
        field: 'sync-join-channel',
      });
      return;
    }
    const passphraseError = validateRecoveryPassphrase(manualPassphrase);
    if (passphraseError) {
      fail({ message: passphraseError, field: 'sync-join-passphrase' });
      return;
    }
    try {
      await onManualJoin(relayUrl, manualChannelId.trim(), manualPassphrase);
    } catch (error) {
      fail(syncFeedback(error, 'Could not join. Check your details and try again.', 'sync-join'));
    }
  }

  async function handleQrJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pairingPayload || busy) return;
    remember();
    setFeedback(null);
    const passphraseError = validateRecoveryPassphrase(pairingPassphrase);
    if (passphraseError) {
      fail({ message: passphraseError, field: 'sync-qr-passphrase' });
      return;
    }
    try {
      await onQrJoin(pairingPayload, pairingPassphrase);
    } catch (error) {
      fail(syncFeedback(error, 'Could not pair. Try scanning again.', 'sync-qr'));
    }
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

  const advanced = (
    <SyncRelayFields
      setup={mode === 'setup'}
      open={showAdvanced}
      onToggle={() => setShowAdvanced((value) => !value)}
      relayUrl={relayUrl}
      onRelayChange={setRelayUrl}
      mintSecret={mintSecret}
      onMintChange={setMintSecret}
      feedback={feedback}
    />
  );

  const formKeys = dialogKeyDown({
    onCancel,
    onSubmit: () => flowRef.current?.querySelector<HTMLFormElement>('form')?.requestSubmit(),
  });

  return (
    <div
      ref={flowRef}
      onChange={() => setFeedback(null)}
      onKeyDown={formKeys}
      onKeyDownCapture={(event) => {
        methodArrow.current =
          !!(event.target as Element).closest('[role="radiogroup"]') &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key);
      }}
    >
      {mode === 'setup' ? (
        <form onSubmit={(event) => void handleSetup(event)} className="space-y-5">
          <div>
            <SettingsSubsectionHeading className="mb-1 font-display text-lg">
              Set up sync
            </SettingsSubsectionHeading>
            <p className="text-sm text-ink-soft">
              Start here on your first device. Your study data is encrypted before it leaves this
              device.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SyncField
              id="sync-setup-passphrase"
              error={fieldError('sync-setup-passphrase')}
              label="Recovery passphrase"
              value={setupPassphrase}
              onChange={setSetupPassphrase}
              type="password"
              autoComplete="new-password"
            />
            <SyncField
              id="sync-setup-confirmation"
              error={fieldError('sync-setup-confirmation')}
              label="Confirm recovery passphrase"
              value={setupConfirmation}
              onChange={setSetupConfirmation}
              type="password"
              autoComplete="new-password"
            />
          </div>
          <p className="text-xs text-ink-faint">
            Use at least 16 characters. Keep this phrase safe: you need it to recover your pairing
            or join another device without a QR code.
          </p>
          {advanced}
          {formError}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy !== null}>
              {busy === 'setup' ? 'Setting up…' : 'Set up sync'}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <div className="mb-5">
            <SettingsSubsectionHeading className="mb-1 font-display text-lg">
              Join another device
            </SettingsSubsectionHeading>
            <p className="text-sm text-ink-soft">
              Scan the pairing QR from your other device, or enter its channel details manually.
            </p>
          </div>
          <SegmentedPills
            label="Pairing method"
            value={joinMode}
            options={[
              { value: 'qr', label: 'QR code' },
              { value: 'manual', label: 'Enter details' },
            ]}
            onChange={(value) => {
              setFeedback(null);
              setJoinMode(value);
            }}
            className="mb-5"
          />

          {joinMode === 'qr' ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Button
                  data-scan
                  variant="secondary"
                  onClick={scanning ? handleStopScan : handleStartScan}
                  disabled={!cameraAvailable || busy !== null}
                >
                  <CameraIcon width={18} height={18} />
                  {scanning ? 'Stop scanning' : 'Scan pairing QR'}
                </Button>
                {!pairingPayload && (
                  <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>
                    Cancel
                  </Button>
                )}
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
                <form onSubmit={(event) => void handleQrJoin(event)} className="space-y-4">
                  <div className="rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm text-ink-soft">
                    QR read. This device will pair with{' '}
                    <span className="font-mono text-xs text-ink">{pairingPayload.relayUrl}</span>.
                  </div>
                  <SyncField
                    id="sync-qr-passphrase"
                    error={fieldError('sync-qr-passphrase')}
                    label="Recovery passphrase for this device"
                    value={pairingPassphrase}
                    onChange={setPairingPassphrase}
                    type="password"
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-ink-faint">
                    Choose at least 16 characters to protect this device’s recovery copy. You can
                    reuse your existing recovery passphrase.
                  </p>
                  {formError}
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
            <form onSubmit={(event) => void handleManualJoin(event)} className="space-y-4">
              <div>
                <SyncField
                  id="sync-join-channel"
                  error={fieldError('sync-join-channel')}
                  label="Channel id"
                  value={manualChannelId}
                  onChange={setManualChannelId}
                  placeholder="32 lowercase hexadecimal characters"
                  autoComplete="off"
                />
              </div>
              <SyncField
                id="sync-join-passphrase"
                error={fieldError('sync-join-passphrase')}
                label="Recovery passphrase"
                value={manualPassphrase}
                onChange={setManualPassphrase}
                type="password"
                autoComplete="current-password"
              />
              <p className="text-xs text-ink-faint">
                Enter the recovery passphrase chosen when sync was first set up. Keep it and the
                channel id private.
              </p>
              {advanced}
              {formError}
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
      )}
    </div>
  );
}
