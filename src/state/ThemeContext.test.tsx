import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

function Consumer() {
  const { resolvedTheme } = useTheme();
  return <output>{resolvedTheme}</output>;
}

describe('ThemeProvider', () => {
  it('opens a fresh install in Volt dark mode without overriding a saved light theme', () => {
    localStorage.removeItem('lacuna-theme');
    const view = render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(screen.getByText('dark')).toBeInTheDocument();
    view.unmount();
    localStorage.setItem('lacuna-theme', 'light');
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(screen.getByText('light')).toBeInTheDocument();
  });
  it('updates consumers when the system theme changes in auto mode', () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const mediaQuery = {
      matches: false,
      addEventListener: (_event: string, next: (event: MediaQueryListEvent) => void) => { listener = next; },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));
    localStorage.setItem('lacuna-theme', 'auto');
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(screen.getByText('light')).toBeInTheDocument();
    mediaQuery.matches = true;
    act(() => listener?.({ matches: true } as MediaQueryListEvent));
    expect(screen.getByText('dark')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
