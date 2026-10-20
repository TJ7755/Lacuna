import Dexie from 'dexie';
import {
  createInsightsOwner,
  recoverInsightsOwner,
  type InsightsOwner,
  type InsightsRecovery,
} from './envelope';
import { serialiseInsightsRecoveryFile } from './recoveryFile';
import { INSIGHT_ID_RE } from '../../relay/src/insightsProtocol';

interface StoredOwner {
  shareId: string;
  recovery: InsightsRecovery;
}

export class InsightsOwnerConflictError extends Error {
  constructor() {
    super('This course already has a teacher key. Restore that key instead of replacing it.');
    this.name = 'InsightsOwnerConflictError';
  }
}

/** Teacher-only storage: never imports or opens the learner database. */
export function createInsightsOwnerStore(databaseName = 'lacuna.gaps.owner-keys') {
  const database = new Dexie(databaseName);
  database.version(1).stores({ owners: 'shareId' });
  database.version(2).stores({ owners: 'shareId', remembered: 'shareId' });
  const owners = database.table<StoredOwner, string>('owners');

  const remembered = database.table<
    { shareId: string; keyId: string; privateKey: CryptoKey },
    string
  >('remembered');

  async function remember(
    shareId: string,
    owner: InsightsOwner,
    allowSameKey: boolean,
  ): Promise<void> {
    // Finish crypto before opening this transaction: awaiting WebCrypto inside
    // an IndexedDB transaction can let it commit before the write is ready.
    await database.transaction('rw', owners, async () => {
      const existing = await owners.get(shareId);
      if (
        existing &&
        (!allowSameKey || existing.recovery?.recipient?.keyId !== owner.recipient.keyId)
      ) {
        throw new InsightsOwnerConflictError();
      }
      await owners.put({ shareId, recovery: owner.recovery });
    });
  }

  return {
    async create(shareId: string, passphrase: string): Promise<InsightsOwner> {
      const owner = await createInsightsOwner(passphrase, shareId);
      await remember(shareId, owner, false);
      return owner;
    },

    async restore(shareId: string, recovery: unknown, passphrase: string): Promise<InsightsOwner> {
      const owner = await recoverInsightsOwner(recovery, passphrase, shareId);
      await remember(shareId, owner, true);
      return owner;
    },

    async exportRecovery(shareId: string): Promise<string> {
      const stored = await owners.get(shareId);
      if (!stored) throw new Error('This browser has no key for this class yet.');
      return serialiseInsightsRecoveryFile(shareId, stored.recovery);
    },

    async unlock(shareId: string, passphrase: string): Promise<InsightsOwner | null> {
      if (!INSIGHT_ID_RE.test(shareId)) throw new Error('The share link code is invalid.');
      const stored = await owners.get(shareId);
      return stored ? recoverInsightsOwner(stored.recovery, passphrase, shareId) : null;
    },

    async rememberOnDevice(shareId: string, owner: InsightsOwner): Promise<boolean> {
      try {
        if (owner.privateKey.extractable) return false;
        return await database.transaction('rw', owners, remembered, async () => {
          const saved = await owners.get(shareId);
          if (saved?.recovery.recipient.keyId !== owner.recipient.keyId) return false;
          await remembered.put({
            shareId,
            keyId: owner.recipient.keyId,
            privateKey: owner.privateKey,
          });
          return true;
        });
      } catch {
        return false;
      }
    },

    async readRemembered(shareId: string): Promise<InsightsOwner | null> {
      return database.transaction('rw', owners, remembered, async () => {
        const saved = await owners.get(shareId);
        const row = await remembered.get(shareId);
        if (!row) return null;
        if (!saved || row.keyId !== saved.recovery.recipient.keyId) {
          await remembered.delete(shareId);
          return null;
        }
        return {
          recipient: saved.recovery.recipient,
          recovery: saved.recovery,
          privateKey: row.privateKey,
        };
      });
    },

    async forgetRemembered(shareId: string): Promise<void> {
      await remembered.delete(shareId);
    },

    close(): void {
      database.close();
    },
  };
}
