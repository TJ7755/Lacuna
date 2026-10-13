import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { friendlyDbError } from './dbErrors';

const full = 'Your browser storage is full. Free up space or export your data to a file.';

describe('friendlyDbError', () => {
  it('translates quota errors whether raw or re-wrapped by Dexie', () => {
    expect(friendlyDbError(new DOMException('quota', 'QuotaExceededError')).message).toBe(full);
    expect(friendlyDbError(new Dexie.QuotaExceededError('quota')).message).toBe(full);
  });

  it('passes other errors through', () => {
    const error = new Error('other');
    expect(friendlyDbError(error)).toBe(error);
    expect(friendlyDbError('offline').message).toBe('offline');
  });
});
