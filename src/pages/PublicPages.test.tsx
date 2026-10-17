import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Method } from './Method';
import { NotFound } from './NotFound';
import { ProductScreen, ProductTour } from './quizlet/ProductTour';

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
  getMotionMultiplier: () => 0,
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MemoryRouter>{children}</MemoryRouter>
    </LazyMotion>
  );
}

describe('public page interactions', () => {
  it('opens the selected screenshot in the shared dialog and restores trigger focus', () => {
    const { container } = render(<ProductTour />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Your notes' }));
    const trigger = screen.getByRole('button', { name: 'Enlarge your notes screenshot' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Your notes' });
    expect(dialog).toHaveClass('rounded-3xl', 'card-surface');
    expect(container).not.toContainElement(dialog);
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'alt',
      expect.stringContaining('lesson'),
    );
    const close = within(dialog).getByRole('button', { name: 'Close screenshot' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(document.querySelector('[data-modal-backdrop]')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('can prerender the comparison screenshot without a browser document', () => {
    vi.stubGlobal('document', undefined);
    try {
      expect(renderToString(<ProductScreen />)).toContain('Actual Lacuna course view');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('discloses the weights and keeps diagram and metric controls operable without motion', () => {
    render(<Method />, { wrapper: Wrapper });
    const disclosure = screen.getByRole('button', { name: 'The ten weights, exactly as shipped' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /log\(prior failures\)/ })).not.toBeInTheDocument();
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const weight = screen.getByRole('button', { name: /log\(prior successes\)/ });
    fireEvent.click(weight);
    expect(weight).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/A strong track record/)).toBeVisible();
    fireEvent.click(disclosure);
    expect(
      screen.queryByRole('button', { name: /log\(prior successes\)/ }),
    ).not.toBeInTheDocument();
    const sigmoid = screen.getByRole('slider', { name: 'Weighted sum z' });
    fireEvent.keyDown(sigmoid, { key: 'ArrowRight' });
    expect(sigmoid).toHaveAttribute('aria-valuenow', '1.7');
    const loss = screen.getByRole('slider', { name: 'Predicted probability of recall' });
    fireEvent.keyDown(loss, { key: 'ArrowLeft' });
    expect(loss).toHaveAttribute('aria-valuenow', '0.85');
    const blend = screen.getByRole('slider', { name: 'Days since last review' });
    fireEvent.keyDown(blend, { key: 'ArrowRight' });
    expect(blend).toHaveAttribute('aria-valuenow', '0.7');
    const metric = screen.getByRole('button', { name: 'Brier score' });
    fireEvent.click(metric);
    expect(metric).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('0.129')).toBeVisible();
  });

  it('allows an unbroken missing pathname to wrap inside its card', () => {
    const pathname = `/${'x'.repeat(200)}`;
    render(
      <MemoryRouter initialEntries={[pathname]}>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByText(pathname)).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.getByRole('link', { name: 'Back to Today' })).toBeVisible();
  });
});
