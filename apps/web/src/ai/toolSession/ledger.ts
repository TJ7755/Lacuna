import type {
  AiToolInvokeRequest,
  AiToolEffects,
  AiToolInvokeResult,
  AiToolLedgerEntry,
  AiToolWireResponse,
} from './types';
import type { AiActionReceipt } from '../protocol';

export function ledgerKey(connectionId: string, callId: string): string {
  return `${connectionId}\u0000${callId}`;
}

export function bindingMatches(
  entry: AiToolLedgerEntry,
  request: AiToolInvokeRequest,
  toolName: string,
  inputDigest: string,
): boolean {
  return (
    entry.connectionId === request.connectionId &&
    entry.runId === request.runId &&
    entry.callId === request.callId &&
    entry.toolName === toolName &&
    entry.inputDigest === inputDigest
  );
}

export function storeLedger(
  ledger: Map<string, AiToolLedgerEntry>,
  request: AiToolInvokeRequest,
  tool: { name: string; requiredScope: AiToolLedgerEntry['requiredScope'] },
  target: { courseId: string },
  inputDigest: string,
  response: AiToolWireResponse,
  receipt: AiActionReceipt | undefined,
  maxEntries: number,
): void {
  ledger.set(ledgerKey(request.connectionId, request.callId), {
    connectionId: request.connectionId,
    runId: request.runId,
    callId: request.callId,
    toolName: tool.name,
    courseId: target.courseId,
    inputDigest,
    requiredScope: tool.requiredScope,
    response,
    ...(receipt ? { receipt } : {}),
  });
  while (ledger.size > maxEntries) {
    const first = ledger.keys().next().value;
    if (first === undefined) break;
    ledger.delete(first);
  }
}

export function replay(entry: AiToolLedgerEntry): AiToolInvokeResult {
  const effects: AiToolEffects = entry.receipt
    ? {
        receipt: entry.receipt,
        activity: {
          status: 'completed',
          summary: entry.receipt.summary,
          updatedAt: entry.receipt.createdAt,
        },
      }
    : {};
  return { response: entry.response, effects };
}
