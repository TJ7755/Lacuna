import type { AiClientIdentity, AiInstructionBundle } from '../../../src/ai/protocol.js';
import type {
  RelayBrowserMailbox,
  RelayTerminalMailbox,
  RelayToolResponse,
} from '../../../src/ai/relayProtocol.js';

export type TerminalRelayReconnectReason = 'write_outcome_unknown' | 'terminal_writer_changed';

const TERMINAL_RECONNECT_MESSAGES: Record<TerminalRelayReconnectReason, string> = {
  write_outcome_unknown:
    'The terminal mailbox write outcome is unknown. Reconnect Lacuna AI before continuing.',
  terminal_writer_changed:
    'Another terminal writer changed this Lacuna AI session. Reconnect Lacuna AI before continuing.',
};

export class TerminalRelayReconnectRequiredError extends Error {
  readonly reason: TerminalRelayReconnectReason;

  constructor(reason: TerminalRelayReconnectReason = 'write_outcome_unknown') {
    super(TERMINAL_RECONNECT_MESSAGES[reason]);
    this.name = 'TerminalRelayReconnectRequiredError';
    this.reason = reason;
  }
}

export interface ConnectedTerminalRelay {
  relayUrl: string;
  sessionId: string;
  expiresAt: number;
}

export interface TerminalRelayTransport {
  connect(
    code: string,
    relayUrl: string,
    client: AiClientIdentity,
  ): Promise<ConnectedTerminalRelay>;
  readBrowserMailbox(
    connection: ConnectedTerminalRelay,
    signal?: AbortSignal,
  ): Promise<{
    generation: string;
    mailbox: RelayBrowserMailbox;
  } | null>;
  writeTerminalMailbox(
    connection: ConnectedTerminalRelay,
    generation: string,
    mailbox: RelayTerminalMailbox,
    signal?: AbortSignal,
  ): Promise<string>;
}

export type WaitForMessageResult =
  | {
      type: 'message';
      messageId: string;
      conversationId: string;
      runId: string;
      content: string;
      createdAt: number;
      leaseExpiresAt: number;
      instructions: AiInstructionBundle;
    }
  | { type: 'stop_requested'; messageId: string; runId: string }
  | { type: 'empty' };

type WithoutRelayEnvelope<T> = T extends unknown
  ? Omit<T, 'runId' | 'callId' | 'respondedAt'>
  : never;

export type TerminalToolResponse = WithoutRelayEnvelope<RelayToolResponse>;

export interface TerminalAiClientOptions {
  transport: TerminalRelayTransport;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  createId?: (prefix: 'event' | 'run') => string;
}
