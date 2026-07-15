import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { useCard } from './useData';
import { useCourse, useCourseSummary, useLesson, useSequence } from './useCourseData';

describe('single-record live-query hooks', () => {
  beforeEach(async () => {
    await Promise.all([
      db.courses.clear(),
      db.lessons.clear(),
      db.cards.clear(),
      db.sequences.clear(),
    ]);
  });

  const missingRecordHooks: Array<[string, () => unknown]> = [
    ['course', () => useCourse('missing')],
    ['lesson', () => useLesson('missing')],
    ['sequence', () => useSequence('missing')],
    ['card', () => useCard('missing')],
    ['course summary', () => useCourseSummary('missing')],
  ];

  it.each(missingRecordHooks)('returns null after a missing %s lookup completes', async (_label, hook) => {
    const { result } = renderHook(hook);
    await waitFor(() => expect(result.current).toBeNull());
  });
});
