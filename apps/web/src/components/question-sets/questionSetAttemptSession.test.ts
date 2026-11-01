import { describe, expect, it, vi } from 'vitest';
import { QuestionSetAttemptRevisionConflictError } from '../../questions/questionSetAttemptRepository';
import { QuestionSetAttemptSession } from './questionSetAttemptSession';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';

const initial = {
  id: 'attempt',
  revisionId: 'r1',
  updatedAt: 1,
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

describe('background writes', () => {
  it('re-runs a command once against the latest record after a background write', async () => {
    const stored = { ...initial, revisionId: 'r2', updatedAt: 2 };
    const session = new QuestionSetAttemptSession(initial, async () => stored);
    const seen: string[] = [];
    await session.run(async (current) => {
      seen.push(current.revisionId);
      if (current.revisionId === 'r1') throw new QuestionSetAttemptRevisionConflictError();
      return { ...current, revisionId: 'r3', updatedAt: 3 };
    });
    expect(seen).toEqual(['r1', 'r2']);
    expect(session.snapshot.record.revisionId).toBe('r3');
    expect(session.snapshot.error).toBeNull();
  });
  it('stops on a second conflict instead of retrying indefinitely', async () => {
    const session = new QuestionSetAttemptSession(initial, async () => initial);
    const command = vi.fn(async () => {
      throw new QuestionSetAttemptRevisionConflictError();
    });
    await expect(session.run(command)).rejects.toThrow(QuestionSetAttemptRevisionConflictError);
    expect(command).toHaveBeenCalledTimes(2);
  });
  it('adopts newer stored revisions only while idle', async () => {
    const session = new QuestionSetAttemptSession(initial);
    session.adopt({ ...initial, revisionId: 'old', updatedAt: 0 });
    expect(session.snapshot.record.revisionId).toBe('r1');
    let release!: () => void;
    const pending = session.run(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ...initial, revisionId: 'r2', updatedAt: 2 });
        }),
    );
    await Promise.resolve();
    session.adopt({ ...initial, revisionId: 'bg', updatedAt: 5 });
    release();
    await pending;
    expect(session.snapshot.record.revisionId).toBe('r2');
    session.adopt({ ...initial, revisionId: 'bg', updatedAt: 5 });
    expect(session.snapshot.record.revisionId).toBe('bg');
  });
});
