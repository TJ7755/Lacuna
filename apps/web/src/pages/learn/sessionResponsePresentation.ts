import type { AnswerResponse } from './sessionAnswers';
import { transitionResponseTimer, type ResponseTimer } from './sessionMachine';

type HintStep = 0 | 1 | 2;

/** Owns the hints, input identity and thinking time captured for an answer. */
export class SessionResponsePresentation {
  private timer: ResponseTimer = { startedAt: 0, responseSeconds: 0, pausedElapsed: 0 };
  hintStep: HintStep = 0;
  input: AnswerResponse['input'] = undefined;

  setHintStep(value: HintStep | ((previous: HintStep) => HintStep)) {
    this.hintStep = typeof value === 'function' ? value(this.hintStep) : value;
  }

  resetHints() {
    this.hintStep = 0;
  }

  clearInput() {
    this.input = undefined;
  }

  start(now: number) {
    // Starting a question retains the captured answer and paused duration.
    this.timer = transitionResponseTimer(this.timer, { type: 'start', now });
  }

  advanceTimer(event: { type: 'pause' | 'resume'; now: number }) {
    this.timer = transitionResponseTimer(this.timer, event);
  }

  reveal(input: AnswerResponse['input'], now: number, lines?: number) {
    this.input = input;
    this.timer = transitionResponseTimer(this.timer, { type: 'reveal', now, lines });
  }

  restoreAnswer(responseSeconds: number, input: AnswerResponse['input']) {
    this.timer = { ...this.timer, responseSeconds };
    this.input = input;
  }

  get responseSeconds() {
    return this.timer.responseSeconds;
  }

  elapsedSeconds(now: number) {
    return (now - this.timer.startedAt) / 1000;
  }
}
