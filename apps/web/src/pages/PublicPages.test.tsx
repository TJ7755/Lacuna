import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
});
