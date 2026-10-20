import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '../db/schema';
import { loadQuestionSetDraft, saveQuestionSetDraft } from '../questions/questionSetDrafts';
import { open, resetEditorData, setup } from './questionSetEditorTestSupport';

beforeEach(resetEditorData);

it.each(['edit', 'study'] as const)(
  'keeps draft-only prompt matches within author visibility (%s)',
  async (mode) => {
    const course = await setup();
    const draft = (await loadQuestionSetDraft(course.id, 'paper-set'))!;
    draft.content.title = 'Unpublished cell paper';
    draft.content.questions[0].prompt = 'Explain selective permeability.';
    await saveQuestionSetDraft(draft, { expectedDraftRevisionId: draft.draftRevisionId });
    await db.courses.update(course.id, { lessonViewMode: mode });
    open(course.id, 'questions?q=selective');

    if (mode === 'edit') {
      expect(await screen.findByRole('heading', { name: 'Unpublished cell paper' })).toBeVisible();
      expect(screen.getByText(/Question 1: Explain selective permeability/)).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Attempt' })).not.toBeInTheDocument();
    } else {
      expect(await screen.findByRole('heading', { name: 'No matching sets' })).toBeVisible();
      expect(screen.queryByText('Unpublished cell paper')).not.toBeInTheDocument();
      expect(screen.queryByText(/Explain selective permeability/)).not.toBeInTheDocument();
    }
  },
);
