import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccentProvider, useAccent } from '../../state/AccentContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { useChartColours } from './useChartColours';

function Chart() {
  const colours = useChartColours();
  const { setAccent } = useAccent();
  return <><output>{colours.accent}</output><button onClick={() => setAccent('blue')}>Blue</button></>;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('refreshes chart colours after an accent choice and an automatic system theme change', async () => {
  localStorage.clear();
  localStorage.setItem('lacuna-theme', 'auto');
  let listener: (() => void) | undefined;
  const media = {
    matches: false,
    addEventListener: (_: string, handler: () => void) => { listener = handler; },
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', () => media);
  // Model the browser's stylesheet boundary; keep both providers and the hook real.
  vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({
    getPropertyValue: () => document.documentElement.classList.contains('dark')
      ? '213 90% 64%'
      : document.documentElement.dataset.accent === 'blue' ? '217 90% 52%' : '32 90% 48%',
  } as unknown as CSSStyleDeclaration));
  render(<ThemeProvider><AccentProvider><Chart /></AccentProvider></ThemeProvider>);
  await waitFor(() => expect(screen.getByText('hsl(32 90% 48%)')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Blue' }));
  await waitFor(() => expect(screen.getByText('hsl(217 90% 52%)')).toBeInTheDocument());
  media.matches = true;
  act(() => listener?.());
  await waitFor(() => expect(screen.getByText('hsl(213 90% 64%)')).toBeInTheDocument());
});
