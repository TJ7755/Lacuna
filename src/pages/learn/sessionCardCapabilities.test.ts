import { describe, expect, it } from 'vitest';
import {
  hasMachineMarkedPayload,
  isTypingEligible,
  isUnrenderableItemPayload,
  typingExpectedAnswer,
} from './sessionCardCapabilities';

describe('session card capabilities', () => {
  it('limits typing to ordinary front/back, reversed and cloze cards', () => {
    expect(isTypingEligible({ type: 'front_back' })).toBe(true);
    expect(isTypingEligible({ type: 'cloze' })).toBe(true);
    expect(
      isTypingEligible({
        type: 'front_back',
        payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
      }),
    ).toBe(false);
  });

  it('resolves ordinary, cloze and occlusion typing targets', () => {
    expect(typingExpectedAnswer({ type: 'front_back', front: 'Q', back: 'A' })).toBe('A');
    expect(typingExpectedAnswer({ type: 'cloze', front: '{{c1::answer}}', back: '' })).toBe('answer');
    expect(typingExpectedAnswer({ type: 'front_back', front: 'Q', back: 'fallback' }, 'label')).toBe('label');
  });

  it('distinguishes machine-marked and unsupported payloads', () => {
    const numeric = {
      payload: {
        v: 1 as const,
        kind: 'numeric' as const,
        answer: { kind: 'exact' as const, value: '1' },
      },
    };
    const scaffold = { payload: { v: 1 as const, kind: 'scaffold' as const } };
    expect(hasMachineMarkedPayload(numeric)).toBe(true);
    expect(isUnrenderableItemPayload(numeric)).toBe(false);
    expect(isUnrenderableItemPayload(scaffold)).toBe(true);
    expect(isUnrenderableItemPayload(null)).toBe(false);
  });
});
