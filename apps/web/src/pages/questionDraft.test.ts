import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newQuestionState, questionDraftKey, useQuestionDraft } from './questionDraft';

vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('Question draft persistence', () => {
  it.each([
    {
      answerKind: 'working' as const,
      workingSource: '[this is not valid mark-scheme source',
      workingFixtures: [{ id: 'fixture-1', studentAnswer: ['x = 2'], expectedMarks: 1 }],
    },
    {
      kind: 'generated' as const,
      generatorConfig: {
        minimumRootMagnitude: 2,
        maximumRootMagnitude: 9,
        allowRepeatedRoots: true,
      },
    },
  ])('restores unfinished authoring after autosaving and remounting: %j', async (patch) => {
    vi.useFakeTimers();
    const key = questionDraftKey('course-1');
    const first = renderHook(() => useQuestionDraft(key));
    act(() => first.result.current.initialise(newQuestionState('')));
    act(() => first.result.current.update(patch));
    await act(async () => vi.advanceTimersByTime(800));
    first.unmount();

    const restored = renderHook(() => useQuestionDraft(key));
    act(() => restored.result.current.initialise(newQuestionState('')));
    expect(restored.result.current.draftPrompt).toBe(true);
    act(() => restored.result.current.restoreDraft());
    expect(restored.result.current.state).toMatchObject(patch);
    expect(restored.result.current.dirty).toBe(true);
  });

  it('isolates saved drafts between courses and new and existing Questions', async () => {
    vi.useFakeTimers();
    const saved = renderHook(() => useQuestionDraft(questionDraftKey('course-1', 'question-1')));
    act(() => saved.result.current.initialise(newQuestionState('')));
    act(() => saved.result.current.update({ prompt: 'Unsaved question' }));
    await act(async () => vi.advanceTimersByTime(800));
    saved.unmount();

    for (const key of [questionDraftKey('course-1'), questionDraftKey('course-2', 'question-1')]) {
      const other = renderHook(() => useQuestionDraft(key));
      act(() => other.result.current.initialise(newQuestionState('')));
      expect(other.result.current.draftPrompt).toBe(false);
      expect(other.result.current.state.prompt).toBe('');
      other.unmount();
    }
    const original = renderHook(() => useQuestionDraft(questionDraftKey('course-1', 'question-1')));
    act(() => original.result.current.initialise(newQuestionState('')));
    expect(original.result.current.draftPrompt).toBe(true);
    act(() => original.result.current.restoreDraft());
    expect(original.result.current.state.prompt).toBe('Unsaved question');
  });
});
