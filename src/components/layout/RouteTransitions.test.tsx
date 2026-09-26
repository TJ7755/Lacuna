import { render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RouteTransitions } from './RouteTransitions';

describe('RouteTransitions', () => {
  it('makes departing pages inert while the latest destination is usable', () => {
    const page = (pathname: string) => (
      <MemoryRouter>
        <LazyMotion features={domAnimation}>
          <RouteTransitions pathname={pathname} direction={1} multiplier={1}>
            <button>{pathname}</button>
          </RouteTransitions>
        </LazyMotion>
      </MemoryRouter>
    );
    const view = render(page('/settings'));
    view.rerender(page('/analytics'));
    expect(view.container.querySelector('[data-route-content="/settings"]')).toHaveAttribute(
      'inert',
    );
    expect(screen.queryByRole('button', { name: '/settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '/analytics' })).toBeEnabled();
    view.rerender(page('/cards'));
    expect(screen.getByRole('button', { name: '/cards' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '/analytics' })).not.toBeInTheDocument();
    view.unmount();
  });

  it.each([0, 1])(
    'moves focus out of a departing page before hiding it with motion multiplier %i',
    (multiplier) => {
      const page = (pathname: string) => (
        <MemoryRouter>
          <LazyMotion features={domAnimation}>
            <RouteTransitions pathname={pathname} direction={0} multiplier={multiplier}>
              <button>{pathname}</button>
            </RouteTransitions>
          </LazyMotion>
        </MemoryRouter>
      );
      const view = render(page('/questions'));
      const outgoingButton = screen.getByRole('button', { name: '/questions' });
      outgoingButton.focus();

      const hiddenWithFocus: Element[] = [];
      const original = Element.prototype.setAttribute;
      const spy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (
        this: Element,
        name,
        value,
      ) {
        if (name === 'aria-hidden' && value === 'true' && this.contains(document.activeElement)) {
          hiddenWithFocus.push(this);
        }
        original.call(this, name, value);
      });
      try {
        view.rerender(page('/questions/new'));
        expect(hiddenWithFocus).toEqual([]);
        expect(outgoingButton).not.toHaveFocus();
        if (multiplier > 0) {
          expect(view.container.querySelector('[data-route-content="/questions"]')).toHaveAttribute(
            'aria-hidden',
            'true',
          );
        }
      } finally {
        spy.mockRestore();
        view.unmount();
      }
    },
  );
});
