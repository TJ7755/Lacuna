import Dexie from 'dexie';
import { parseClassCode } from '../insights/classCode';
import {
  DEFAULT_RELAY_URL,
  getShareBytes,
  parseShareCode,
  parseShareManifest,
  mintShare,
  deleteShare,
  verifyShareOwner,
} from '../shareLinks/client';
import {
  openGapsConnection,
  parseGapsConnectionFile,
  sealGapsConnection,
  type EncryptedGapsConnection,
} from './connectionFile';
import { validateRecoveryPassphrase } from '../sync/pairingConfig';

interface StoredConnection {
  shareId: string;
  file: EncryptedGapsConnection;
  verifiedAt: number;
}
export interface ConnectedGapsCourse {
  shareId: string;
  courseName: string;
  verifiedAt: number;
}

/** Separate teacher storage contains encrypted capabilities, never learner data or passphrases. */
export function createGapsConnectionStore(name = 'lacuna.gaps.connections') {
  const database = new Dexie(name);
  database.version(1).stores({ connections: 'shareId' });
  const connections = database.table<StoredConnection, string>('connections');
  return {
    async createFromLink(
      link: string,
      passphrase: string,
      options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
    ): Promise<string> {
      const invalid = validateRecoveryPassphrase(passphrase);
      if (invalid) throw new Error(invalid);
      let sourceShareId: string;
      try {
        sourceShareId = parseShareCode(link);
      } catch {
        sourceShareId = parseClassCode(link).shareId;
      }
      const relayUrl = DEFAULT_RELAY_URL;
      const source = await getShareBytes({
        relayUrl,
        shareId: sourceShareId,
        slot: 'meta',
        ...options,
      });
      if (!source) throw new Error('The source course is missing or expired.');
      const manifest = parseShareManifest(source.bytes);
      const owner = await mintShare(relayUrl, options.fetchImpl, {
        body: { sourceShareId },
        signal: options.signal,
      });
      try {
        // Older relays ignored mint bodies. Never save a classroom link without live content.
        const linked = await getShareBytes({ relayUrl, ...owner, slot: 'meta', ...options });
        if (!linked || parseShareManifest(linked.bytes).lineageId !== manifest.lineageId)
          throw new Error('The relay could not connect this class to its source course.');
        const text = await sealGapsConnection(
          { ...owner, relayUrl, courseName: manifest.courseName },
          passphrase,
        );
        await verifyShareOwner({ relayUrl, ...owner, ...options });
        if (options.signal?.aborted) throw new Error('Connection cancelled.');
        const file = parseGapsConnectionFile(text);
        await database.transaction('rw', connections, () =>
          connections.put({ shareId: owner.shareId, file, verifiedAt: Date.now() }),
        );
        return owner.shareId;
      } catch (error) {
        await deleteShare({ relayUrl, ...owner, fetchImpl: options.fetchImpl }).catch(
          () => undefined,
        );
        throw error;
      }
    },
    async exportConnection(shareId: string): Promise<string> {
      const saved = await connections.get(shareId);
      if (!saved) throw new Error('The saved connection could not be found.');
      return JSON.stringify(parseGapsConnectionFile(JSON.stringify(saved.file)), null, 2);
    },
    async unlock(shareId: string, passphrase: string) {
      const saved = await connections.get(shareId);
      if (!saved) return null;
      const file = parseGapsConnectionFile(JSON.stringify(saved.file));
      if (file.shareId !== shareId) throw new Error('Invalid saved connection.');
      return openGapsConnection(file, passphrase);
    },
    async list(): Promise<ConnectedGapsCourse[]> {
      return (await connections.toArray())
        .map((row) => {
          const file = parseGapsConnectionFile(JSON.stringify(row.file));
          if (row.shareId !== file.shareId || !Number.isFinite(row.verifiedAt))
            throw new Error('Invalid saved connection.');
          return { shareId: row.shareId, courseName: file.courseName, verifiedAt: row.verifiedAt };
        })
        .sort((a, b) => a.courseName.localeCompare(b.courseName, 'en-GB'));
    },
    async connect(
      text: string,
      passphrase: string,
      options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
    ): Promise<void> {
      const file = parseGapsConnectionFile(text);
      const connection = await openGapsConnection(file, passphrase);
      await verifyShareOwner({ ...connection, ...options });
      if (options.signal?.aborted) throw new Error('Connection cancelled.');
      await database.transaction('rw', connections, () =>
        connections.put({ shareId: file.shareId, file, verifiedAt: Date.now() }),
      );
    },
    async forget(shareId: string): Promise<void> {
      await connections.delete(shareId);
    },
    close(): void {
      database.close();
    },
  };
}
