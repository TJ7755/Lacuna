import { INSIGHT_ID_RE } from '@lacuna/protocol/insights/index';
import { parseInsightsRecovery, type InsightsRecovery } from './envelope';

export const INSIGHTS_RECOVERY_FILE_MAX_BYTES = 16 * 1024;
const KIND = 'lacuna.gaps.teacher-recovery';

export interface InsightsRecoveryFile {
  kind: typeof KIND;
  v: 1;
  shareId: string;
  recovery: InsightsRecovery;
}

export class InsightsRecoveryFileError extends Error {
  constructor() {
    super('That is not a supported Gaps teacher recovery file.');
    this.name = 'InsightsRecoveryFileError';
  }
}

/** The wrapper carries the public course binding, never the passphrase or raw private key. */
export function serialiseInsightsRecoveryFile(shareId: string, recovery: InsightsRecovery): string {
  const text = JSON.stringify({ kind: KIND, v: 1, shareId, recovery }, null, 2);
  parseInsightsRecoveryFile(text);
  return text;
}

export function parseInsightsRecoveryFile(text: string): InsightsRecoveryFile {
  try {
    if (new TextEncoder().encode(text).byteLength > INSIGHTS_RECOVERY_FILE_MAX_BYTES)
      throw new Error('oversized');
    const raw = JSON.parse(text) as Record<string, unknown> | null;
    if (
      !raw ||
      Array.isArray(raw) ||
      Object.keys(raw).length !== 4 ||
      raw.kind !== KIND ||
      raw.v !== 1 ||
      typeof raw.shareId !== 'string' ||
      !INSIGHT_ID_RE.test(raw.shareId)
    )
      throw new Error('invalid wrapper');
    return {
      kind: KIND,
      v: 1,
      shareId: raw.shareId,
      recovery: parseInsightsRecovery(raw.recovery),
    };
  } catch {
    throw new InsightsRecoveryFileError();
  }
}
