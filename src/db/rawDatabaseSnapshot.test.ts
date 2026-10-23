import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAllDataFromVersion } from './schema';

let source: Dexie;
const card = { id: 'card', front: 'Original question', back: 'Original answer' };

describe('raw pre-migration snapshot reads', () => {
  beforeEach(async () => {
    source = new Dexie(`raw-snapshot-${crypto.randomUUID()}`);
    source.version(29).stores({ cards: 'id', assets: 'hash' });
    await source.table('cards').put(card);
    source.close();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await source.delete();
  });

  it('rejects a version changed since the caller checked it', async () => {
    await expect(readAllDataFromVersion(source.name, 28)).rejects.toThrow(
      'Database version mismatch: expected 28, found 29',
    );
    await source.open();
    expect(await source.table('cards').get(card.id)).toEqual(card);
  });

  it('rejects an aborted store read instead of returning a partial backup', async () => {
    const getAll = IDBObjectStore.prototype.getAll;
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementationOnce(function (this: IDBObjectStore) {
      const request = getAll.call(this);
      const transaction = this.transaction;
      queueMicrotask(() => transaction.abort());
      return request;
    });

    await expect(readAllDataFromVersion(source.name, 29)).rejects.toMatchObject({
      name: 'AbortError',
    });
    await source.open();
    expect(await source.table('cards').get(card.id)).toEqual(card);
  });
});
