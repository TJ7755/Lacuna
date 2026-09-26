import { describe, expect, it, vi } from 'vitest';
import { QuestionSetAttemptSession } from './questionSetAttemptSession';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';

const initial = {
  id: 'attempt',
  revisionId: 'r1',
  responses: [{ nodeId: 'q1', draft: { kind: 'written', text: '' } }],
} as QuestionSetAttemptRecord;
describe('attempt write queue', () => {
  it('serialises commands using the last saved revision', async () => {
    const session = new QuestionSetAttemptSession(initial);
    const seen: string[] = [];
    const first = session.run(async (current) => {
      seen.push(current.revisionId);
      await Promise.resolve();
      return { ...current, revisionId: 'r2' };
    });
    const second = session.run(async (current) => {
      seen.push(current.revisionId);
      return { ...current, revisionId: 'r3' };
    });
    await Promise.all([first, second]);
    expect(seen).toEqual(['r1', 'r2']);
    expect(session.snapshot.record.revisionId).toBe('r3');
    expect(session.snapshot.pending).toBe(0);
  });
  it('retains the failed command and blocks later commands until retry', async () => {
    const session = new QuestionSetAttemptSession(initial);
    const failing = vi
      .fn()
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValue({ ...initial, revisionId: 'r2' });
    const later = vi.fn(async (current: QuestionSetAttemptRecord) => ({
      ...current,
      revisionId: 'r3',
    }));
    await expect(session.run(failing)).rejects.toThrow('Storage unavailable');
    await expect(session.run(later)).rejects.toThrow('Storage unavailable');
    expect(later).not.toHaveBeenCalled();
    await session.retry();
    expect(failing).toHaveBeenCalledTimes(2);
    expect(session.snapshot.record.revisionId).toBe('r2');
    expect(session.snapshot.error).toBeNull();
  });
});

it('retains accepted commands queued behind a failure and replays them in order', async () => {
  const session = new QuestionSetAttemptSession(initial);
  const first = vi
    .fn()
    .mockRejectedValueOnce(new Error('Storage unavailable'))
    .mockResolvedValue({ ...initial, revisionId: 'r2' });
  const later = vi.fn(async (current: QuestionSetAttemptRecord) => ({
    ...current,
    revisionId: 'r3',
  }));
  const results = await Promise.allSettled([session.run(first), session.run(later)]);
  expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
  await session.retry();
  expect(later).toHaveBeenCalledWith(expect.objectContaining({ revisionId: 'r2' }));
  expect(session.snapshot.record.revisionId).toBe('r3');
});
