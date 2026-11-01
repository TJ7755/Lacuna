import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { readAnswerInput, useAnswerInput, writeAnswerInput } from './answerInput';

beforeEach(() => localStorage.clear());

it('defaults to course suggestions and ignores the obsolete typing preference', () => {
  localStorage.setItem('lacuna.typingSetting', 'type');
  expect(readAnswerInput()).toBe('course');
  localStorage.setItem('lacuna.answerInput', 'invalid');
  expect(readAnswerInput()).toBe('course');
});

it.each(['course', 'type', 'reveal'] as const)('persists and observes %s', (value) => {
  const hook = renderHook(() => useAnswerInput());
  act(() => writeAnswerInput(value));
  expect(hook.result.current[0]).toBe(value);
  expect(localStorage.getItem('lacuna.answerInput')).toBe(value);
  hook.unmount();
  expect(renderHook(() => useAnswerInput()).result.current[0]).toBe(value);
});
