import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../../db/types';
import type * as JevModule from '../../jev';
import type { JevTypedAnswerRequest, JevTypedVerdict } from '../../jev';
import { useTypedAutoMark } from './useTypedAutoMark';

const jev = vi.hoisted(() => ({
  marker: null as null | ((request: JevTypedAnswerRequest) => Promise<JevTypedVerdict>),
}));

vi.mock('../../jev', async (importOriginal) => ({
  ...(await importOriginal<typeof JevModule>()),
  useJevTypedMarker: () => jev.marker,
}));

const card = { id: 'c1', type: 'front_back', front: 'Capital of France?', back: 'Paris' } as Card;
const provenance = { by: 'jev', model: 'jev-test', confidence: 0.97, markedAt: 1 } as const;

function setup(typedAnswer: string, overrides: { paused?: boolean } = {}) {
  const onMarked = vi.fn();
  const hook = renderHook(() =>
    useTypedAutoMark({
      card,
      phase: 'answer',
      isTypingCard: true,
      typedAnswer,
      answerStrictness: 'standard',
      paused: overrides.paused ?? false,
      m: 1,
      onMarked,
    }),
  );
  return { ...hook, onMarked };
}

describe('useTypedAutoMark', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    jev.marker = null;
  });

  it('stays off and never marks while automatic marking is unavailable', () => {
    const { result, onMarked } = setup('Paris');
    expect(result.current).toEqual({ state: 'off' });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onMarked).not.toHaveBeenCalled();
  });

  it('marks a word-for-word match locally without asking the marker', () => {
    jev.marker = vi.fn();
    const { result, onMarked } = setup('Paris');
    expect(result.current).toMatchObject({ state: 'marked', correct: true, provenance: null });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onMarked).toHaveBeenCalledWith(true, null);
    expect(jev.marker).not.toHaveBeenCalled();
  });

  it('applies a confident verdict for a mismatched answer, with provenance', async () => {
    jev.marker = vi.fn().mockResolvedValue({ outcome: 'correct', provenance });
    const { result, onMarked } = setup('paris, the french capital');
    expect(result.current).toEqual({ state: 'checking' });
    await act(async () => {});
    expect(result.current).toMatchObject({ state: 'marked', correct: true });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onMarked).toHaveBeenCalledWith(true, provenance);
    expect(jev.marker).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Capital of France?', expected: 'Paris' }),
    );
  });

  it('leaves grading to the learner when the marker is unsure', async () => {
    jev.marker = vi.fn().mockResolvedValue({ outcome: 'unsure' });
    const { result, onMarked } = setup('Lyon');
    await act(async () => {});
    expect(result.current).toEqual({ state: 'idle' });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onMarked).not.toHaveBeenCalled();
  });

  it('holds a mark while paused', () => {
    jev.marker = vi.fn();
    const { onMarked } = setup('Paris', { paused: true });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onMarked).not.toHaveBeenCalled();
  });
});
