import { useEffect, useState } from 'react';
import { createInsightsOwnerStore } from '../insights/ownerStore';
import {
  INSIGHTS_RECOVERY_FILE_MAX_BYTES,
  parseInsightsRecoveryFile,
  type InsightsRecoveryFile,
} from '../insights/recoveryFile';
import {
  downloadGapsFile,
  GAPS_CONNECTION_FILE_MAX_BYTES,
  openGapsConnection,
  parseGapsConnectionFile,
  type EncryptedGapsConnection,
} from './connectionFile';
import { createGapsConnectionStore } from './connectionStore';
import { rememberClass } from './rememberedClass';
import type { ClassSession } from './classSessions';

export const CLASS_RECOVERY_FILE_MAX_BYTES =
  GAPS_CONNECTION_FILE_MAX_BYTES + INSIGHTS_RECOVERY_FILE_MAX_BYTES;
export const CLASS_RECOVERY_ERROR =
  'Could not open class recovery. Check the file and recovery code.';
export interface ClassRecoveryFile {
  kind: 'lacuna-gaps-class';
  v: 1;
  shareId: string;
  connection: EncryptedGapsConnection;
  recovery: InsightsRecoveryFile;
}

export function parseClassRecoveryFile(text: string): ClassRecoveryFile {
  try {
    if (new TextEncoder().encode(text).byteLength > CLASS_RECOVERY_FILE_MAX_BYTES)
      throw new Error();
    const raw = JSON.parse(text);
    if (!raw || Object.keys(raw).length !== 5 || raw.kind !== 'lacuna-gaps-class' || raw.v !== 1)
      throw new Error();
    const connection = parseGapsConnectionFile(JSON.stringify(raw.connection));
    const recovery = parseInsightsRecoveryFile(JSON.stringify(raw.recovery));
    if (raw.shareId !== connection.shareId || raw.shareId !== recovery.shareId) throw new Error();
    return { kind: raw.kind, v: 1, shareId: raw.shareId, connection, recovery };
  } catch {
    throw new Error(CLASS_RECOVERY_ERROR);
  }
}

export function serialiseClassRecoveryFile(
  shareId: string,
  connection: EncryptedGapsConnection,
  recovery: InsightsRecoveryFile,
): string {
  const text = JSON.stringify(
    { kind: 'lacuna-gaps-class', v: 1, shareId, connection, recovery },
    null,
    2,
  );
  parseClassRecoveryFile(text);
  return text;
}

export async function downloadClassRecoveryFile(shareId: string): Promise<void> {
  const connections = createGapsConnectionStore(),
    keys = createInsightsOwnerStore();
  try {
    const text = serialiseClassRecoveryFile(
      shareId,
      parseGapsConnectionFile(await connections.exportConnection(shareId)),
      parseInsightsRecoveryFile(await keys.exportRecovery(shareId)),
    );
    downloadGapsFile(text, `gaps-class-${shareId}.json`);
  } finally {
    connections.close();
    keys.close();
  }
}

export async function restoreClassRecovery(
  file: ClassRecoveryFile,
  code: string,
  remember: boolean,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ClassSession> {
  const connections = createGapsConnectionStore(),
    keys = createInsightsOwnerStore();
  try {
    const saved = parseClassRecoveryFile(JSON.stringify(file));
    const connection = await openGapsConnection(saved.connection, code);
    // Restore refuses a conflicting key. If relay verification then fails, no new
    // connection is visible and restoring the same key is safe on the next attempt.
    const owner = await keys.restore(saved.shareId, saved.recovery.recovery, code);
    await connections.connect(JSON.stringify(saved.connection), code, options);
    await connections.markRecoveryCode(saved.shareId);
    const session: ClassSession = { connection, owner, days: new Map() };
    if (remember) session.remembered = await rememberClass(session);
    return session;
  } catch {
    throw new Error(CLASS_RECOVERY_ERROR);
  } finally {
    connections.close();
    keys.close();
  }
}

/** Detect the wrapper for field selection; submit still runs the strict parser. */
export function useClassRecoverySelection(file: File | null) {
  const [codeProtected, setCodeProtected] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    let active = true;
    setCodeProtected(false);
    if (!file || file.size > CLASS_RECOVERY_FILE_MAX_BYTES) {
      setReading(false);
      return;
    }
    setReading(true);
    void file
      .text()
      .then((text) => {
        if (!active) return;
        try {
          setCodeProtected(JSON.parse(text)?.kind === 'lacuna-gaps-class');
        } catch {
          /* Submit reports malformed files. */
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReading(false);
      });
    return () => {
      active = false;
    };
  }, [file]);
  return { codeProtected, reading };
}
