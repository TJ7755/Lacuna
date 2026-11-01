import { act, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiFloatingWindow } from './AiFloatingWindow';

// Happy DOM rejects cancelled native-animation promises; exercise Motion's real JS fallback.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
});
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

describe('AiFloatingWindow exit', () => {
  it('retires the departing window and revives retained controls during rapid reopening', async () => {
    const view = (open: boolean, inert = false) => (
      <LazyMotion features={domAnimation}>
        <AiFloatingWindow open={open} multiplier={1} inert={inert}>
          {() => <button>Send message</button>}
        </AiFloatingWindow>
      </LazyMotion>
    );
    const { rerender } = render(view(true));
    const send = screen.getByRole('button', { name: 'Send message' });
    rerender(view(false));
    expect(send).toBeInTheDocument();
    expect(send.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
    rerender(view(true));
    expect(screen.getByRole('button', { name: 'Send message' })).toBe(send);
    expect(send.closest('[inert]')).toBeNull();
    rerender(view(true, true));
    expect(send.closest('[inert]')).not.toBeNull();
    rerender(view(true));
    expect(send.closest('[inert]')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 500)));
  });
});
