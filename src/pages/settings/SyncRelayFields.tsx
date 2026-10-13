import { AnimatedDisclosure } from '../../components/ui/AnimatedDisclosure';
import { Button } from '../../components/ui/Button';
import { DEFAULT_RELAY_URL } from '../../sync/pairingConfig';
import { SyncField } from './SyncField';
import type { SyncFeedback } from './syncFeedback';

/** Private-relay administration stays together, outside the ordinary pairing path. */
export function SyncRelayFields({
  setup,
  open,
  onToggle,
  relayUrl,
  onRelayChange,
  mintSecret,
  onMintChange,
  feedback,
}: {
  setup: boolean;
  open: boolean;
  onToggle: () => void;
  relayUrl: string;
  onRelayChange: (value: string) => void;
  mintSecret: string;
  onMintChange: (value: string) => void;
  feedback: SyncFeedback | null;
}) {
  const relayId = setup ? 'sync-setup-relay' : 'sync-join-relay';
  const isDefault = relayUrl.trim() === '' || relayUrl.trim() === DEFAULT_RELAY_URL;
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls="sync-private-relay"
        onClick={onToggle}
      >
        {open ? 'Hide advanced' : 'Advanced: use a private relay'}
      </Button>
      <AnimatedDisclosure open={open} innerClassName="space-y-4 pt-3">
        <div id="sync-private-relay" className="space-y-4">
          <SyncField
            id={relayId}
            label="Relay URL"
            value={relayUrl}
            onChange={onRelayChange}
            placeholder={DEFAULT_RELAY_URL}
            error={feedback?.field === relayId ? feedback.message : undefined}
          />
          {setup && (
            <>
              <SyncField
                id="sync-mint-secret"
                label="Relay mint secret (private relays only)"
                value={mintSecret}
                onChange={onMintChange}
                type="password"
                autoComplete="off"
                placeholder={
                  isDefault ? 'Leave empty for the default relay' : 'Required for this relay'
                }
                error={feedback?.field === 'sync-mint-secret' ? feedback.message : undefined}
              />
              <p className="text-xs text-ink-faint">
                The relay mint secret is used only to create this channel and is not stored. Ask
                your relay administrator for it.
              </p>
            </>
          )}
        </div>
      </AnimatedDisclosure>
    </div>
  );
}
