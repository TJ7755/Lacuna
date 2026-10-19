import Dexie from 'dexie';
import { verifyShareOwner } from '../shareLinks/client';
import {
  openGapsConnection,
  parseGapsConnectionFile,
  type EncryptedGapsConnection,
} from './connectionFile';

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
