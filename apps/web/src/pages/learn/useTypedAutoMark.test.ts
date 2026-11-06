import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@lacuna/core/db/types';
import type * as JevModule from '../../jev';
import type { JevStatus, JevTypedAnswerRequest, JevTypedVerdict } from '../../jev';
import { JEV_JUDGING_MS, JEV_TYPED_TIMEOUT_MS } from '../../jev';
import { TYPED_AUTO_MARK_DELAY_MS, useTypedAutoMark } from './useTypedAutoMark';

const jev = vi.hoisted(() => ({
  status: { state: 'off' } as JevStatus,
  marker: null as null | ((request: JevTypedAnswerRequest) => Promise<JevTypedVerdict>),
}));

vi.mock('../../jev', async (importOriginal) => ({
  ...(await importOriginal<typeof JevModule>()),
  useJevTypedMarker: () => jev.marker,
  useJevStatus: () => jev.status,
}));

const card = { id: 'c1', type: 'front_back', front: 'Capital of France?', back: 'Paris' } as Card;
const provenance = { by: 'jev', model: 'jev-test', confidence: 0.97, markedAt: 1 } as const;

function setup(
  typedAnswer: string,
  overrides: {
    paused?: boolean;
    m?: number;
    card?: Card;
    manual?: boolean;
    answerStrictness?: 'lenient' | 'standard' | 'exact';
  } = {},
) {
  const onMarked = vi.fn();
  const hook = renderHook(() =>
    useTypedAutoMark({
      card: overrides.card ?? card,
      phase: 'answer',
      isTypingCard: true,
      typedAnswer,
      answerStrictness: overrides.answerStrictness ?? 'standard',
      paused: overrides.paused ?? false,
      manual: overrides.manual,
      m: overrides.m ?? 1,
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
    jev.status = { state: 'off' };
  });

  it('stays off and never marks while automatic marking is unavailable', () => {
    const { result, onMarked } = setup('Paris');
    expect(result.current).toEqual({ state: 'off' });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onMarked).not.toHaveBeenCalled();
  });

  it('shows a submitted answer being judged before marking it', () => {
    jev.marker = vi.fn();
    const { result } = setup('Paris');
    expect(result.current).toEqual({ state: 'checking' });
    act(() => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS - 1);
    });
    expect(result.current).toEqual({ state: 'checking' });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toMatchObject({ state: 'marked', correct: true, provenance: null });
  });

  it('marks a word-for-word match locally without asking the marker', () => {
    jev.marker = vi.fn();
    const { result, onMarked } = setup('Paris');
    act(() => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
    });
    expect(result.current).toMatchObject({ state: 'marked', correct: true, provenance: null });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      if (result.current.state === 'marked') result.current.onContinue?.();
    });
    expect(onMarked).toHaveBeenCalledWith(true, null);
    expect(jev.marker).not.toHaveBeenCalled();
  });

  it('applies a confident verdict for a mismatched answer, with provenance', async () => {
    jev.marker = vi.fn().mockResolvedValue({ outcome: 'correct', provenance });
    const { result, onMarked } = setup('paris, the french capital');
    expect(result.current).toEqual({ state: 'checking' });
    await act(async () => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    // A quick verdict is held until the answer has visibly been judged.
    expect(result.current).toEqual({ state: 'checking' });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
    });
    expect(result.current).toMatchObject({ state: 'marked', correct: true });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      if (result.current.state === 'marked') result.current.onContinue?.();
    });
    expect(onMarked).toHaveBeenCalledWith(true, provenance);
    expect(jev.marker).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Capital of France?', expected: 'Paris' }),
    );
  });

  it.each(['lenient', 'standard', 'exact'] as const)(
    'handles semantic matches under %s strictness',
    async (answerStrictness) => {
      const feedback = { kind: 'same' as const, parts: [] };
      jev.marker = vi.fn().mockResolvedValue({ outcome: 'correct', provenance, feedback });
      const { result, onMarked } = setup('paris, the french capital', { answerStrictness });
      await act(async () => {
        vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
      });
      act(() => {
        vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
      });
      expect(result.current).toMatchObject(
        answerStrictness === 'exact'
          ? { state: 'unsure', feedback, expected: 'Paris' }
          : { state: 'marked', correct: true, feedback },
      );
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      if (answerStrictness === 'exact') expect(onMarked).not.toHaveBeenCalled();
      else {
        act(() => {
          if (result.current.state === 'marked') result.current.onContinue?.();
        });
        expect(onMarked).toHaveBeenCalledWith(true, provenance);
      }
    },
  );

  it('retains an incorrect Jev verdict under Exact', async () => {
    jev.marker = vi.fn().mockResolvedValue({ outcome: 'incorrect', provenance });
    const { result, onMarked } = setup('Lyon', { answerStrictness: 'exact' });
    await act(async () => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
    });
    expect(result.current).toMatchObject({ state: 'marked', correct: false });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      if (result.current.state === 'marked') result.current.onContinue?.();
    });
    expect(onMarked).toHaveBeenCalledWith(false, provenance);
  });

  it.each(['partial', 'imprecise'] as const)(
    'passes %s Hard with provenance under Exact',
    async (kind) => {
      jev.marker = vi.fn().mockResolvedValue({
        outcome: 'incorrect',
        provenance,
        feedback: {
          kind,
          parts: [
            { start: 0, end: 1, covered: true },
            { start: 1, end: 2, covered: true },
            { start: 2, end: 3, covered: false },
          ],
        },
      });
      const { result, onMarked } = setup('Lyon', { answerStrictness: 'exact' });
      await act(async () => {
        vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
      });
      act(() => {
        vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
      });
      expect(result.current).toMatchObject({ state: 'marked', correct: false });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      act(() => {
        if (result.current.state === 'marked') result.current.onContinue?.();
      });
      expect(onMarked).toHaveBeenCalledWith(false, provenance, 2);
    },
  );

  it('leaves grading to the learner when the marker is unsure', async () => {
    jev.marker = vi.fn().mockResolvedValue({ outcome: 'unsure' });
    const { result, onMarked } = setup('Lyon');
    await act(async () => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
    });
    expect(result.current).toEqual({ state: 'manual', reason: 'uncertain' });
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

  it.each([0, 0.6, 1, 1.5])('keeps feedback until Continue at motion multiplier %s', (m) => {
    jev.marker = vi.fn();
    const { result, onMarked } = setup('Paris', { m });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS * Math.max(m, 0.3));
    });
    expect(result.current.state).toBe('marked');
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onMarked).not.toHaveBeenCalled();
    act(() => {
      if (result.current.state === 'marked') {
        result.current.onContinue?.();
      }
    });
    expect(onMarked).toHaveBeenCalledExactlyOnceWith(true, null);
  });

  it('does not accept a verdict from a global Space or Enter key', () => {
    jev.marker = vi.fn();
    const { onMarked } = setup('Paris');
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));
    });
    expect(onMarked).not.toHaveBeenCalled();
  });

  it('leaves an answer restored by Undo for manual grading without another verdict', () => {
    jev.marker = vi.fn();
    const { result, onMarked } = setup('Paris', { manual: true });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.state).toBe('idle');
    expect(jev.marker).not.toHaveBeenCalled();
    expect(onMarked).not.toHaveBeenCalled();
  });

  it('keeps formulae in the marker input rather than giving credit for the surrounding text', async () => {
    jev.marker = vi.fn().mockResolvedValue({ outcome: 'unsure', feedback: null });
    const { result, onMarked } = setup('E =', {
      card: { ...card, front: 'Explain $E = mc^2$.', back: 'E = $mc^2$' },
    });
    await act(async () => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
    });
    expect(jev.marker).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Explain E = mc^2 .',
        expected: 'E = mc^2',
      }),
    );
    expect(result.current.state).toBe('manual');
    expect(onMarked).not.toHaveBeenCalled();
  });

  it('restores manual grading when a marker does not settle after the timeout', async () => {
    let signal: AbortSignal | undefined;
    jev.marker = vi.fn((request) => {
      signal = request.signal;
      return new Promise<JevTypedVerdict>(() => {});
    });
    const { result, onMarked } = setup('Lyon');
    expect(result.current.state).toBe('checking');
    await act(async () => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS + JEV_TYPED_TIMEOUT_MS);
    });
    expect(signal?.aborted).toBe(true);
    expect(result.current).toEqual({ state: 'manual', reason: 'timeout' });
    expect(onMarked).not.toHaveBeenCalled();
  });

  it('explains an unavailable enabled marker in the current answer', () => {
    jev.status = { state: 'paused', reason: 'limit-reached', lastUsedAt: 1, retryAt: 1000 };
    const { result } = setup('Lyon');
    expect(result.current).toEqual({ state: 'manual', reason: 'limit-reached', retryAt: 1000 });
  });

  it('explains a rejected marker request and keeps manual grading available', async () => {
    jev.marker = vi.fn().mockRejectedValue(new Error('offline'));
    const { result, onMarked } = setup('Lyon');
    await act(async () => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    expect(result.current).toEqual({ state: 'manual', reason: 'error' });
    expect(onMarked).not.toHaveBeenCalled();
  });

  it('ignores a confident verdict arriving after manual grading has been restored', async () => {
    let resolve!: (verdict: JevTypedVerdict) => void;
    jev.marker = vi.fn(
      () =>
        new Promise<JevTypedVerdict>((done) => {
          resolve = done;
        }),
    );
    const { result, onMarked } = setup('Lyon');
    await act(async () => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS + JEV_TYPED_TIMEOUT_MS);
    });
    await act(async () => {
      resolve({ outcome: 'incorrect', provenance, feedback: { kind: 'wrong', parts: [] } });
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toEqual({ state: 'manual', reason: 'timeout' });
    expect(onMarked).not.toHaveBeenCalled();
  });
});
