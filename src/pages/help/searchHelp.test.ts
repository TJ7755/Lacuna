import { describe, expect, it } from 'vitest';
import { helpTopics } from './helpTopics';
import { searchHelp } from './searchHelp';

describe('searchHelp', () => {
  it.each([
    ['exam date', ['exam-date']],
    ['exam', ['exam-date', 'assessment-revision']],
    ['back up', ['backups']],
    ['diagram', ['occlusions']],
    ['swipe', ['touch-gestures']],
  ])('ranks the direct answer first for %s', (query, ids) => {
    expect(ids).toContain(searchHelp(query)[0]?.id);
  });

  it('requires every word and ignores case and surrounding whitespace', () => {
    expect(searchHelp(' PICTURE sharing ').map((topic) => topic.id)).toEqual(['share-diagram']);
    expect(searchHelp('picture nonexistent')).toEqual([]);
  });

  it('returns the full catalogue in its original order for an empty query', () => {
    expect(searchHelp('')).toEqual(helpTopics);
  });
});
