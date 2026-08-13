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
  it('keeps text-size controls shrinkable at narrow widths', () => {
    renderAppearance();

    const larger = screen.getByRole('button', { name: /Larger/ });
    expect(larger).toHaveClass('min-w-0', 'px-1.5');

    fireEvent.click(larger);
    expect(larger).toHaveAttribute('aria-pressed', 'true');
  });
});
