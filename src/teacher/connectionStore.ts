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
  type GapsCourseConnection,
} from './connectionFile';
import { validateRecoveryPassphrase } from '../sync/pairingConfig';

interface StoredConnection {
  shareId: string;
  file: EncryptedGapsConnection;
  verifiedAt: number;
  secret?: 'recovery-code';
}
export interface ConnectedGapsCourse {
  shareId: string;
  courseName: string;
  verifiedAt: number;
  secret?: 'recovery-code';
}

/** Separate teacher storage contains encrypted capabilities, never learner data or passphrases. */
export function createGapsConnectionStore(name = 'lacuna.gaps.connections') {
  const database = new Dexie(name);
  database.version(1).stores({ connections: 'shareId' });
  database.version(2).stores({ connections: 'shareId', remembered: 'shareId', deviceKeys: 'id' });
  const connections = database.table<StoredConnection, string>('connections');
  const remembered = database.table<
    {
      shareId: string;
      connectionCiphertext: string;
      nonce: Uint8Array<ArrayBuffer>;
      ciphertext: ArrayBuffer;
    },
    string
  >('remembered');
  const deviceKeys = database.table<{ id: string; key: CryptoKey }, string>('deviceKeys');
  const aad = (shareId: string) => new TextEncoder().encode(`lacuna-gaps-device-v1|${shareId}`);
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
    async markRecoveryCode(shareId: string): Promise<void> {
      if (!(await connections.update(shareId, { secret: 'recovery-code' })))
        throw new Error('The saved connection could not be found.');
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
          return {
            shareId: row.shareId,
            courseName: file.courseName,
            verifiedAt: row.verifiedAt,
            ...(row.secret === 'recovery-code' ? { secret: row.secret } : {}),
          };
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
    async rememberOnDevice(connection: GapsCourseConnection): Promise<boolean> {
      const { shareId } = connection;
      try {
        const saved = await connections.get(shareId);
        if (!saved) return false;
        // WebCrypto must finish before entering a Dexie transaction.
        const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
          'decrypt',
        ]);
        const key = await database.transaction('rw', deviceKeys, async () => {
          const existing = await deviceKeys.get('device');
          if (existing) return existing.key;
          await deviceKeys.put({ id: 'device', key: candidate });
          return candidate;
        });
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const bytes = new TextEncoder().encode(connection.writeToken);
        let ciphertext: ArrayBuffer;
        try {
          ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: aad(shareId) },
            key,
            bytes,
          );
        } finally {
          bytes.fill(0);
        }
        return await database.transaction('rw', connections, remembered, async () => {
          const current = await connections.get(shareId);
          if (current?.file.c !== saved.file.c) return false;
          await remembered.put({ shareId, connectionCiphertext: saved.file.c, nonce, ciphertext });
          return true;
        });
      } catch {
        return false;
      }
    },
    async readRemembered(shareId: string): Promise<GapsCourseConnection | null> {
      const saved = await connections.get(shareId);
      const row = await remembered.get(shareId);
      const device = await deviceKeys.get('device');
      if (!row) return null;
      if (!saved || !device || row.connectionCiphertext !== saved.file.c) {
        await remembered.delete(shareId);
        return null;
      }
      const file = parseGapsConnectionFile(JSON.stringify(saved.file));
      const bytes = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: row.nonce, additionalData: aad(shareId) },
          device.key,
          row.ciphertext,
        ),
      );
      try {
        const writeToken = new TextDecoder().decode(bytes);
        if (!/^[0-9a-f]{64}$/.test(writeToken)) throw new Error('Invalid device credential.');
        return { shareId, courseName: file.courseName, relayUrl: file.relayUrl, writeToken };
      } finally {
        bytes.fill(0);
      }
    },
    async forgetRemembered(shareId: string): Promise<void> {
      await remembered.delete(shareId);
    },
    async forget(shareId: string): Promise<void> {
      const { createInsightsOwnerStore } = await import('../insights/ownerStore');
      const keys = createInsightsOwnerStore();
      try {
        await keys.forgetRemembered(shareId);
        await database.transaction('rw', connections, remembered, async () => {
          await remembered.delete(shareId);
          await connections.delete(shareId);
        });
      } finally {
        keys.close();
      }
    },
    close(): void {
      database.close();
    },
  };
}
