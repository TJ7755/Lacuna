import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@lacuna/core/db/types';
import type * as JevModule from '../../jev';
import type { JevTypedAnswerRequest, JevTypedVerdict } from '../../jev';
import { JEV_JUDGING_MS, JEV_TYPED_TIMEOUT_MS } from '../../jev';
import { TYPED_AUTO_MARK_DELAY_MS, useTypedAutoMark } from './useTypedAutoMark';

const jev = vi.hoisted(() => ({
  marker: null as null | ((request: JevTypedAnswerRequest) => Promise<JevTypedVerdict>),
}));

vi.mock('../../jev', async (importOriginal) => ({
  ...(await importOriginal<typeof JevModule>()),
  useJevTypedMarker: () => jev.marker,
}));

const card = { id: 'c1', type: 'front_back', front: 'Capital of France?', back: 'Paris' } as Card;
const provenance = { by: 'jev', model: 'jev-test', confidence: 0.97, markedAt: 1 } as const;

function setup(
  typedAnswer: string,
  overrides: {
    paused?: boolean;
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
      else expect(onMarked).toHaveBeenCalledWith(true, provenance);
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
    expect(onMarked).toHaveBeenCalledWith(false, provenance);
  });

  it('leaves grading to the learner when the marker is unsure', async () => {
    jev.marker = vi.fn().mockResolvedValue({ outcome: 'unsure' });
    const { result, onMarked } = setup('Lyon');
    await act(async () => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
    });
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

  it('uses Space as a brake and moves immediately on release after the usual hold', () => {
    jev.marker = vi.fn();
    const { onMarked } = setup('Paris');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    });
    act(() => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onMarked).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(onMarked).toHaveBeenCalledExactlyOnceWith(true, null);
  });

  it('keeps the original deadline when Space is released early', () => {
    jev.marker = vi.fn();
    const { onMarked } = setup('Paris');
    act(() => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onMarked).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onMarked).toHaveBeenCalledOnce();
  });

  it('releases the brake when the window loses focus', () => {
    jev.marker = vi.fn();
    const { onMarked } = setup('Paris');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    });
    act(() => {
      vi.advanceTimersByTime(TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(JEV_JUDGING_MS - TYPED_AUTO_MARK_DELAY_MS);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(onMarked).toHaveBeenCalledOnce();
  });

  it.each(['button', 'a'])('keeps Space available to activate a focused %s', (tag) => {
    jev.marker = vi.fn();
    setup('Paris');
    const control = document.createElement(tag);
    document.body.append(control);
    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    control.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    control.remove();
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
    expect(result.current.state).toBe('idle');
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
    expect(result.current).toEqual({ state: 'idle' });
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
    expect(result.current).toEqual({ state: 'idle' });
    expect(onMarked).not.toHaveBeenCalled();
  });
});
