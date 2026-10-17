import { describe, expect, it } from 'vitest';
import { backupStatus, STALE_BACKUP_MS } from './backupStatus';

const NOW = Date.UTC(2026, 7, 28, 12);

describe('backupStatus', () => {
  it('flags a missing backup as stale', () => {
    expect(backupStatus(null, NOW)).toEqual({ label: 'No backup yet', tone: 'stale' });
  });

  it('reads a backup from the last minute as just now', () => {
    expect(backupStatus(NOW - 5_000, NOW)).toEqual({ label: 'Backed up just now', tone: 'fresh' });
  });

  it('stays fresh within three days', () => {
    const status = backupStatus(NOW - 2 * 60 * 60 * 1000, NOW);
    expect(status.tone).toBe('fresh');
    expect(status.label).toMatch(/^Backed up /);
  });

  it('turns stale from three days on', () => {
    const status = backupStatus(NOW - STALE_BACKUP_MS, NOW);
    expect(status.tone).toBe('stale');
    expect(status.label).toMatch(/^Last backup /);
  });
});
