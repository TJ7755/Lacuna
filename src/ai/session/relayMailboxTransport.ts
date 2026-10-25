import type { RelaySessionState } from './relaySessionState';
import type { JsonValue } from '../protocol';
import type { RelayBrowserMailbox } from '../relayProtocol';
import type { RelayAiSessionOptions, RelaySessionCrypto } from './relay';

export function createRelayMailboxTransport(
  state: Pick<RelaySessionState, 'persisted' | 'encryptionKey' | 'pollingEpoch'>,
  {
    options,
    crypto,
  }: { options: Pick<RelayAiSessionOptions, 'relay'>; crypto: RelaySessionCrypto },
) {
  async function getEncryptionKey(epoch: number): Promise<CryptoKey | null> {
    if (epoch !== state.pollingEpoch) return null;
    if (state.encryptionKey) return state.encryptionKey;
    const connection = state.persisted;
    if (!connection?.peerPublicKey) throw new Error('AI terminal is not paired.');
    const derivedKey = await crypto.deriveKey(
      connection.keyPair.privateKey,
      connection.peerPublicKey,
    );
    if (epoch !== state.pollingEpoch || state.persisted !== connection) return null;
    state.encryptionKey = derivedKey;
    return derivedKey;
  }

  async function pushMailbox(mailbox: RelayBrowserMailbox, epoch: number): Promise<string | null> {
    if (!state.persisted) throw new Error('AI terminal is not paired.');
    const key = await getEncryptionKey(epoch);
    if (!key || epoch !== state.pollingEpoch) return null;
    const envelope = await crypto.seal(key, mailbox as JsonValue);
    if (epoch !== state.pollingEpoch) return null;
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    const pushed = await options.relay.push(
      state.persisted.credentials,
      bytes,
      state.persisted.browserGeneration,
    );
    if (epoch !== state.pollingEpoch) return null;
    return pushed.generation;
  }
  return { getEncryptionKey, pushMailbox };
}
