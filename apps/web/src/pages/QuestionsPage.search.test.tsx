import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { createQuestionSet } from '../questions/questionSetRepository';
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

it.each([
  ['author', 'edit', false, false, true],
  ['study', 'study', false, false, false],
  ['locked edit setting', 'edit', true, false, false],
  ['archived edit setting', 'edit', false, true, false],
] as const)(
  'gates answer-only library search for %s',
  async (_name, mode, locked, archived, allowed) => {
    const course = await setup();
    const draft = (await loadQuestionSetDraft(course.id, 'paper-set'))!;
    await createQuestionSet({
      ...draft.content,
      id: 'published-set',
      title: 'Published paper',
      questions: [
        {
          id: 'q1',
          prompt: 'Explain diffusion.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'mark',
                criterion: 'Selective permeability',
                explanation: 'Water potential gradient',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    });
    await db.courses.update(course.id, {
      lessonViewMode: mode,
      archived,
      ...(locked
        ? {
            distributedCopy: {
              lineageId: 'biology',
              revision: 1,
              locked: true,
              autoAcceptUpdates: false,
            },
          }
        : {}),
    });
    open(course.id, 'questions?q=selective');
    const search = await screen.findByRole('searchbox', { name: 'Search sets' });
    for (const [query, label] of [
      ['selective', 'Mark scheme: Question 1 criterion: Selective permeability'],
      ['water potential', 'Mark scheme: Question 1 explanation: Water potential gradient'],
    ]) {
      fireEvent.change(search, { target: { value: query } });
      if (allowed) {
        expect(await screen.findByRole('heading', { name: 'Published paper' })).toBeVisible();
        expect(screen.getByText(label)).toBeVisible();
      } else {
        expect(await screen.findByRole('heading', { name: 'No matching sets' })).toBeVisible();
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
    }
    fireEvent.change(search, { target: { value: 'diffusion' } });
    expect(await screen.findByRole('heading', { name: 'Published paper' })).toBeVisible();
    expect(screen.getByText('Question 1: Explain diffusion.')).toBeVisible();
    expect(
      screen.queryByText(/Selective permeability|Water potential gradient/),
    ).not.toBeInTheDocument();
    if (allowed) {
      fireEvent.change(search, { target: { value: 'selective' } });
      await screen.findByText('Mark scheme: Question 1 criterion: Selective permeability');
      await db.courses.update(course.id, { lessonViewMode: 'study' });
      await waitFor(() =>
        expect(screen.queryByText(/Selective permeability/)).not.toBeInTheDocument(),
      );
      expect(await screen.findByRole('heading', { name: 'No matching sets' })).toBeVisible();
    }
  },
);
