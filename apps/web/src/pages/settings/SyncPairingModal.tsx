import { Suspense, lazy, type ComponentProps } from 'react';
import { Button } from '../../components/ui/Button';
import { QrCodeIcon, ShareIcon } from '../../components/ui/icons';
import type { SyncState } from '@lacuna/core/db/types';
import { SettingsModal } from './SettingsModal';
import type { SyncPairingBusy, SyncPairingMode } from './SyncPairingFlow';

export const loadSyncPairingFlow = () =>
  import('./SyncPairingFlow').then((module) => ({ default: module.SyncPairingFlow }));
const SyncPairingFlow = lazy(loadSyncPairingFlow);

export function SyncPairingModal({
  pairOpen,
  syncState,
  mode,
  closePair,
  pairingBusy,
  handleSetup,
  handleManualJoin,
  handleQrJoin,
  cancelFlow,
  beginSetup,
  beginJoin,
}: {
  pairOpen: boolean;
  syncState: SyncState | null;
  mode: 'idle' | SyncPairingMode;
  closePair: () => void;
  pairingBusy: SyncPairingBusy;
  handleSetup: ComponentProps<typeof SyncPairingFlow>['onSetup'];
  handleManualJoin: ComponentProps<typeof SyncPairingFlow>['onManualJoin'];
  handleQrJoin: ComponentProps<typeof SyncPairingFlow>['onQrJoin'];
  cancelFlow: () => void;
  beginSetup: () => void;
  beginJoin: () => void;
}) {
  return (
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
            onSetup={handleSetup}
            onManualJoin={handleManualJoin}
            onQrJoin={handleQrJoin}
            onCancel={cancelFlow}
          />
        </Suspense>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button id="sync-begin-setup" variant="primary" onClick={beginSetup}>
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
  );
}
