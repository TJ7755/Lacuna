import { render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
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
});
