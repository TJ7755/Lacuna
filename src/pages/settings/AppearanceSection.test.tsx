import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccentProvider } from '../../state/AccentContext';
import { FontScaleProvider } from '../../state/FontScaleContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { AppearanceSection } from './AppearanceSection';

function renderAppearance() {
  return render(
    <ThemeProvider>
      <AccentProvider>
        <FontScaleProvider>
          <AppearanceSection />
        </FontScaleProvider>
      </AccentProvider>
    </ThemeProvider>,
  );
}

describe('AppearanceSection', () => {
  it('chooses text size from a pill, named by step', () => {
    renderAppearance();

    const larger = screen.getByRole('radio', { name: 'Larger' });
    expect(larger).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(larger);
    expect(larger).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Default' })).toHaveAttribute('aria-checked', 'false');
  });

  it('chooses the theme from a pill', () => {
    renderAppearance();

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  });

  it('offers every accent as a round radio and rings the chosen one', () => {
    renderAppearance();

    const group = screen.getByRole('radiogroup', { name: 'Accent colour' });
    expect(group.querySelectorAll('[role="radio"]').length).toBeGreaterThan(1);
    expect(screen.getByRole('radio', { name: 'Violet' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    expect(screen.getByRole('radio', { name: 'Teal' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Violet' })).toHaveAttribute('aria-checked', 'false');
  });

  it('moves the old stored amber default to violet but keeps other choices', () => {
    localStorage.setItem('lacuna-accent', 'amber');
    const { unmount } = renderAppearance();
    expect(screen.getByRole('radio', { name: 'Violet' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.accent).toBe('violet');
    unmount();

    localStorage.setItem('lacuna-accent', 'teal');
    renderAppearance();
    expect(screen.getByRole('radio', { name: 'Teal' })).toHaveAttribute('aria-checked', 'true');
  });
});
