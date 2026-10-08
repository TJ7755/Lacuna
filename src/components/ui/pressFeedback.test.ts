import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPressFeedback, pressDepth } from './pressFeedback';

function sized<T extends HTMLElement>(element: T, width: number, height: number): T {
  element.getBoundingClientRect = () => ({ width, height }) as DOMRect;
  return element;
}

describe('installPressFeedback', () => {
  let uninstall: () => void;
  let animate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    animate = vi.fn(() => ({ cancel: vi.fn() }));
    HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate'];
    uninstall = installPressFeedback();
  });

  afterEach(() => {
    uninstall();
    document.body.innerHTML = '';
  });

  it('sinks a plain button on press and springs it back on release', () => {
    const button = sized(document.createElement('button'), 44, 44);
    button.innerHTML = '<span>Go</span>';
    document.body.append(button);

    button.firstElementChild!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
    );
    expect(animate.mock.instances[0]).toBe(button);
    expect(animate.mock.calls[0][0]).toEqual([{ scale: '1' }, { scale: '0.96' }]);

    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[1][0][0]).toEqual({ scale: '0.96' });
  });

  it('leaves controls that animate themselves, and disabled ones, alone', () => {
    const own = sized(document.createElement('button'), 44, 44);
    own.dataset.press = '';
    const disabled = sized(document.createElement('button'), 44, 44);
    disabled.disabled = true;
    document.body.append(own, disabled);

    own.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    disabled.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));

    expect(animate).not.toHaveBeenCalled();
  });

  it.each(['button', 'a', 'summary'])('acknowledges keyboard activation of a %s', (tag) => {
    const control = sized(document.createElement(tag), 100, 44);
    if (tag === 'a') control.setAttribute('href', '#/share');
    document.body.append(control);
    control.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.instances[0]).toBe(control);
    expect(animate.mock.calls[0][0].at(-1)).toEqual({ scale: '1' });
  });

  it('acknowledges keyboard activation of the shared Button without duplicating pointer feedback', () => {
    const button = document.createElement('button');
    button.dataset.press = '';
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(animate).not.toHaveBeenCalled();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('cancels a held press when uninstalled', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    const animation = animate.mock.results[0].value;
    uninstall();
    expect(animation.cancel).toHaveBeenCalled();
  });
});

describe('pressDepth', () => {
  it('sinks large surfaces less than small controls', () => {
    expect(pressDepth(sized(document.createElement('div'), 44, 44))).toBe(0.96);
    expect(pressDepth(sized(document.createElement('div'), 500, 300))).toBe(0.99);
  });
});
