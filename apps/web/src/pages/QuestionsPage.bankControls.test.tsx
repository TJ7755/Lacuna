import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '../db/schema';
import { open, resetEditorData, setup } from './questionSetEditorTestSupport';

beforeEach(resetEditorData);

it('shows bank controls to a locked-course learner without opening question authoring', async () => {
  const course = await setup();
  await db.courses.update(course.id, {
    distributedCopy: {
      lineageId: 'published-biology-lineage',
      revision: 1,
      locked: true,
      autoAcceptUpdates: false,
    },
  });

  open(course.id, 'questions');

  expect(await screen.findByRole('button', { name: 'Import question bank' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'New question set' })).not.toBeInTheDocument();
});
