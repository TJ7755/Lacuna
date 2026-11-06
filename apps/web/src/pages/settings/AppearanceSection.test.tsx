import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
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
  beforeEach(() => localStorage.clear());

  it('uses one accent tab stop and selects colours with arrows, Home and End', () => {
    renderAppearance();
    const group = screen.getByRole('radiogroup', { name: 'Accent colour' });
    const volt = within(group).getByRole('radio', { name: 'Volt' });
    fireEvent.click(volt);
    volt.focus();
    fireEvent.keyDown(volt, { key: 'ArrowRight' });
    const amber = within(group).getByRole('radio', { name: 'Amber' });
    expect(amber).toHaveFocus();
    expect(amber).toHaveAttribute('aria-checked', 'true');
    expect(
      within(group)
        .getAllByRole('radio')
        .filter((radio) => radio.tabIndex === 0),
    ).toEqual([amber]);
    fireEvent.keyDown(amber, { key: 'End' });
    const last = within(group).getAllByRole('radio').at(-1)!;
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Home' });
    expect(volt).toHaveFocus();
    fireEvent.keyDown(volt, { key: 'ArrowLeft' });
    expect(last).toHaveFocus();
  });

  it('offers an in-app motion Off choice', () => {
    renderAppearance();
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('lacuna.motionSpeed')).toBe('off');
  });

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
    expect(screen.getByRole('radio', { name: 'Volt' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Amber' })).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    expect(screen.getByRole('radio', { name: 'Teal' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Volt' })).toHaveAttribute('aria-checked', 'false');
  });
});
