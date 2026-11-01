import { createAiAppRequests } from './aiAppRequests.js';
import type { AiAppClientState } from './aiAppClientState.js';
import net from 'node:net';
import { AiCompanionOperationError } from '../../web/src/ai/companionErrors.js';
import {
  AI_COMPANION_PROTOCOL_VERSION,
  CompanionLineDecoder,
  LEGACY_AI_COMPANION_PROTOCOL_VERSION,
  encodeCompanionMessage,
  isAiCompanionResponse,
  type AiCompanionProtocolVersion,
  type AiCompanionResponse,
} from '../../web/src/mcp/companionEntry.js';
import { readCompanionConnectionFile, type CompanionConnectionFile } from './connectionFile.js';
import { appConnectionError } from './aiAppOperationErrors.js';

class AiProtocolFallbackError extends Error {}

/** Allocated by LocalAiAppClient; socket callbacks and requests share this one ledger. */

export function createAiAppTransport(
  state: Pick<
    AiAppClientState,
    'socket' | 'connecting' | 'pending' | 'activeRun' | 'supportsLeaseRenewal'
  >,
  {
    writeDrainTimeoutMs,
    hostUserDataPath,
    connectTimeoutMs,
    close,
  }: {
    writeDrainTimeoutMs: number;
    hostUserDataPath: string;
    connectTimeoutMs: number;
    close(): void;
  },
) {
  async function open(): Promise<void> {
    if (state.socket && !state.socket.destroyed) return;
    if (state.connecting) return state.connecting;
    state.connecting = connectSocket().finally(() => {
      state.connecting = null;
    });
    return state.connecting;
  }

  async function connectSocket(): Promise<void> {
    let connection;
    try {
      connection = await readCompanionConnectionFile(hostUserDataPath);
    } catch {
      throw new AiCompanionOperationError({
        kind: 'app_unavailable',
        message: 'Lacuna is not running or its local AI endpoint is unavailable.',
        retryable: true,
        suggestedAction: 'open_lacuna',
        userActionRequired: true,
        commitState: 'not_started',
      });
    }
    try {
      await connectSocketWithProtocol(connection, AI_COMPANION_PROTOCOL_VERSION);
    } catch (error) {
      if (!(error instanceof AiProtocolFallbackError)) throw error;
      await connectSocketWithProtocol(connection, LEGACY_AI_COMPANION_PROTOCOL_VERSION);
    }
  }

  async function connectSocketWithProtocol(
    connection: CompanionConnectionFile,
    protocolVersion: AiCompanionProtocolVersion,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(connection.endpoint);
      const decoder = new CompanionLineDecoder();
      let ready = false;
      const fallbackAllowed = protocolVersion === AI_COMPANION_PROTOCOL_VERSION;
      const timeout = setTimeout(
        () =>
          fail(
            fallbackAllowed
              ? new AiProtocolFallbackError()
              : appConnectionError('Timed out while connecting to the running Lacuna application.'),
          ),
        connectTimeoutMs,
      );
      const fail = (error: Error) => {
        clearTimeout(timeout);
        if (!ready) reject(error);
        socket.destroy();
      };
      socket.setEncoding('utf8');
      socket.once('error', () =>
        fail(
          new AiCompanionOperationError({
            kind: 'app_unavailable',
            message: 'Could not connect to the running Lacuna application.',
            retryable: true,
            suggestedAction: 'open_lacuna',
            userActionRequired: true,
            commitState: 'not_started',
          }),
        ),
      );
      socket.once('connect', () => {
        socket.write(
          encodeCompanionMessage({
            type: 'ai_hello',
            protocolVersion,
            token: connection.aiToken,
          }),
        );
      });
      socket.on('data', (chunk: string) => {
        try {
          for (const value of decoder.push(chunk)) {
            if (!isAiCompanionResponse(value))
              throw new Error('Lacuna returned an invalid AI companion response.');
            const response: AiCompanionResponse = value;
            if (!ready) {
              if (response.type !== 'ai_ready') {
                fail(
                  fallbackAllowed
                    ? new AiProtocolFallbackError()
                    : appConnectionError(
                        response.type === 'fatal'
                          ? 'The running Lacuna application rejected the AI companion handshake.'
                          : 'Lacuna returned an invalid AI companion handshake.',
                      ),
                );
                return;
              }
              if (response.protocolVersion !== protocolVersion) {
                fail(
                  fallbackAllowed
                    ? new AiProtocolFallbackError()
                    : appConnectionError('Lacuna returned an incompatible AI companion protocol.'),
                );
                return;
              }
              ready = true;
              clearTimeout(timeout);
              state.socket = socket;
              state.supportsLeaseRenewal =
                response.protocolVersion === AI_COMPANION_PROTOCOL_VERSION &&
                response.capabilities.leaseRenewal;
              resolve();
              continue;
            }
            if (response.type === 'fatal') {
              fail(new Error(response.error.message));
              return;
            }
            if (response.type === 'ai_result') {
              const pending = state.pending.get(response.id);
              if (!pending) continue;
              clearTimeout(pending.timeout);
              state.pending.delete(response.id);
              pending.resolve(response.result);
            }
          }
        } catch (error) {
          if (!ready) {
            fail(
              fallbackAllowed
                ? new AiProtocolFallbackError()
                : appConnectionError('Lacuna returned an invalid AI companion handshake.'),
            );
          } else {
            fail(error instanceof Error ? error : new Error('Invalid response from Lacuna.'));
          }
        }
      });
      socket.once('close', () => {
        if (!ready)
          fail(
            fallbackAllowed
              ? new AiProtocolFallbackError()
              : appConnectionError(
                  'The running Lacuna application closed the AI companion connection.',
                ),
          );
        if (state.socket === socket) close();
      });
    });
  }
  return createAiAppRequests(state, { open, close, writeDrainTimeoutMs });
}
