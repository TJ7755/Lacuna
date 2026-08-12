import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_STAT_PILLS,
  readStored,
  writeCourseHeaderSettings,
} from './courseHeaderSettings';

beforeEach(() => {
  localStorage.clear();
});

describe('courseHeaderSettings', () => {
  it('shows due and mastery by default, and offers the rest', () => {
    const visible = readStored()
      .statPills.filter((pill) => pill.visible)
      .map((pill) => pill.id);
    expect(visible).toEqual(['due', 'mastery']);
  });

  it('keeps a hidden pill hidden across reads', () => {
    const hidden = DEFAULT_STAT_PILLS.map((pill) =>
      pill.id === 'mastery' ? { ...pill, visible: false } : pill,
    );
    writeCourseHeaderSettings({ statPills: hidden });
    expect(readStored().statPills.find((pill) => pill.id === 'mastery')?.visible).toBe(false);
  });

  it('adds pills introduced after the reader last saved, without disturbing their choices', () => {
    // A stored set from an earlier version, missing pills added since.
    localStorage.setItem(
      'lacuna.courseHeaderSettings',
      JSON.stringify({ statPills: [{ id: 'due', label: 'Cards due now', visible: false }] }),
    );
    const { statPills } = readStored();
    expect(statPills).toHaveLength(DEFAULT_STAT_PILLS.length);
    expect(statPills[0]).toMatchObject({ id: 'due', visible: false });
    expect(statPills.find((pill) => pill.id === 'exam')?.visible).toBe(false);
  });

  it('drops stored pills that no longer exist', () => {
    localStorage.setItem(
      'lacuna.courseHeaderSettings',
      JSON.stringify({ statPills: [{ id: 'retired', label: 'Retired', visible: true }] }),
    );
    expect(readStored().statPills).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'retired' })]),
    );
  });

  it('falls back to defaults on unparseable storage', () => {
    localStorage.setItem('lacuna.courseHeaderSettings', 'not json');
    expect(readStored().statPills).toHaveLength(DEFAULT_STAT_PILLS.length);
  });
});
