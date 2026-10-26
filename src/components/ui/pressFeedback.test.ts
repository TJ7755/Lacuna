import { afterEach, describe, expect, it } from 'vitest';
import { installPressFeedback } from './pressFeedback';

// Native activation and stable content are proved in the browser. This boundary
// protects delegation ownership and cleanup without asserting animation keyframes.
describe('press feedback ownership', () => {
  let uninstall: (() => void) | undefined;
  afterEach(() => {
    uninstall?.();
    document.body.innerHTML = '';
  });

  it('decorates a plain control without altering its content or transform', () => {
    const button = document.createElement('button');
    button.innerHTML = '<span>Study</span>';
    button.style.transform = 'translateX(10px)';
    document.body.append(button);
    const label = button.firstChild;
    uninstall = installPressFeedback();
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(button).toHaveClass('flow-feedback');
    expect(button.firstChild).toBe(label);
    expect(button.style.transform).toBe('translateX(10px)');
    uninstall();
    expect(button).not.toHaveClass('flow-feedback');
  });

  it('respects disabled controls and an explicitly owned surface', () => {
    const own = document.createElement('button');
    own.dataset.press = 'none';
    const disabled = document.createElement('button');
    disabled.disabled = true;
    document.body.append(own, disabled);
    uninstall = installPressFeedback();
    for (const button of [own, disabled]) {
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      expect(button).not.toHaveClass('flow-feedback');
    }
  });
});
