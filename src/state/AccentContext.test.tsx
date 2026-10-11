import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccentProvider, useAccent } from './AccentContext';

function Consumer() {
  const { accent, setAccent } = useAccent();
  return <><output>{accent}</output><button onClick={() => setAccent('amber')}>Amber</button></>;
}

describe('Volt accent adoption', () => {
  beforeEach(() => localStorage.clear());

  it('adopts Volt on a fresh install and replaces the old saved amber default only once', () => {
    const fresh = render(<AccentProvider><Consumer /></AccentProvider>);
    expect(screen.getByText('volt')).toBeInTheDocument();
    fresh.unmount();
    localStorage.clear();
    localStorage.setItem('lacuna-accent', 'amber');
    const upgraded = render(<AccentProvider><Consumer /></AccentProvider>);
    expect(screen.getByText('volt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Amber' }));
    expect(screen.getByText('amber')).toBeInTheDocument();
    upgraded.unmount();
    render(<AccentProvider><Consumer /></AccentProvider>);
    expect(screen.getByText('amber')).toBeInTheDocument();
  });

  it('retains a saved alternative accent', () => {
    localStorage.setItem('lacuna-accent', 'blue');
    render(<AccentProvider><Consumer /></AccentProvider>);
    expect(screen.getByText('blue')).toBeInTheDocument();
  });
});
