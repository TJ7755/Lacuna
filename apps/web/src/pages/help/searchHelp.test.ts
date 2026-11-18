import { describe, expect, it } from 'vitest';
import { searchHelp } from './searchHelp';

describe('searchHelp', () => {
  it.each([
    ['exam date', ['exam-date']],
    ['exam', ['exam-date', 'assessment-revision']],
    ['back up', ['backups']],
    ['diagram', ['occlusions']],
    ['swipe', ['touch-gestures']],
    ['exam board', ['choose-qualification']],
    ['combined', ['choose-qualification']],
    ['GCSE IGCSE', ['choose-qualification']],
  ])('ranks the direct answer first for %s', (query, ids) => {
    expect(ids).toContain(searchHelp(query)[0]?.id);
  });
});
