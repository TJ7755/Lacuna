import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTypingFeedback } from './typingFeedback';

describe('installTypingFeedback', () => {
  let uninstall: () => void;
  let animate: ReturnType<typeof vi.fn>;
  let playState: AnimationPlayState;

  beforeEach(() => {
    playState = 'running';
    animate = vi.fn(() => ({
      get playState() {
        return playState;
      },
    }));
    HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate'];
    uninstall = installTypingFeedback();
  });

  afterEach(() => {
    uninstall();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('glows a text field once per burst of typing', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.instances[0]).toBe(input);
    expect(Object.keys(animate.mock.calls[0][0][0])).toEqual(['boxShadow']);

    playState = 'finished';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('leaves choices and opted-out fields alone', () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const quiet = document.createElement('textarea');
    quiet.setAttribute('data-no-typing-feedback', '');
    document.body.append(checkbox, quiet);
    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
    quiet.dispatchEvent(new Event('input', { bubbles: true }));
    expect(animate).not.toHaveBeenCalled();
  });
});
