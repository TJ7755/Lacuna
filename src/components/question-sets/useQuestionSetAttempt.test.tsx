import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useAttemptProgress } from './useQuestionSetAttempt';
import { QuestionSetAttemptSession } from './questionSetAttemptSession';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import { saveQuestionSetResponseDraft } from '../../questions/questionSetAttemptRepository';
vi.mock('react-router-dom', () => ({ useBlocker: () => ({ state: 'unblocked' }) }));
vi.mock('../../questions/questionSetAttemptRepository', () => ({
  getQuestionSetAttempt: vi.fn(),
  saveQuestionSetResponseDraft: vi.fn(),
}));
it('drains text entered while the final storage tail is still settling', async () => {
  const initial = {
    id: 'attempt',
    revisionId: 'r1',
    activeNodeId: 'q1',
    responses: [{ nodeId: 'q1', draft: { kind: 'written', text: '' } }],
  } as QuestionSetAttemptRecord;
  const session = new QuestionSetAttemptSession(initial);
  let resolveTail!: () => void;
  const tail = new Promise<void>((resolve) => {
    resolveTail = resolve;
  });
  vi.spyOn(session, 'flush')
    .mockImplementationOnce(() => tail)
    .mockResolvedValue(undefined);
  vi.mocked(saveQuestionSetResponseDraft).mockImplementation(
    async (_id, _revision, _node, draft) => ({
      ...initial,
      revisionId: 'r2',
      responses: [{ nodeId: 'q1', draft }],
    }),
  );
  const { result } = renderHook(() => useAttemptProgress(session));
  let saving!: Promise<void>;
  act(() => {
    saving = result.current.flush();
  });
  act(() => {
    result.current.edit('q1', { kind: 'written', text: 'Late answer' });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
  await act(async () => {
    resolveTail();
    await saving;
  });
  await waitFor(() =>
    expect(saveQuestionSetResponseDraft).toHaveBeenCalledWith(
      'attempt',
      'r1',
      'q1',
      { kind: 'written', text: 'Late answer' },
      'q1',
    ),
  );
  expect(result.current.dirty).toBe(false);
});
