import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Welcome } from './Welcome';

vi.mock('../hooks/useRevealOnScroll', () => ({
  useRevealOnScroll: () => ({ ref: { current: null }, visible: true }),
}));

vi.mock('../components/welcome/GradingDemo', () => ({
  GradingDemo: () => null,
}));
vi.mock('../components/welcome/DashboardMock', () => ({
  DashboardMock: () => null,
  mockPredictedScore: () => 80,
}));
vi.mock('../components/welcome/ExamCurve', () => ({
  ExamCurve: () => null,
}));
vi.mock('../components/welcome/PathDemo', () => ({
  PathDemo: () => null,
}));
vi.mock('../components/welcome/PracticeDeck', () => ({
  PracticeDeck: () => null,
}));
vi.mock('../components/welcome/LandingCta', () => ({
  LandingCta: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('../components/welcome/useSmoothScroll', () => ({
  useSmoothScroll: () => undefined,
}));

describe('Welcome import entry points', () => {
  it('sends both current-facing import links to the shared-course importer', () => {
    render(<Welcome />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: 'Skip to the checkpoint' }));

    const links = screen.getAllByRole('link', { name: 'Import a shared course' });
    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/share?intent=import'));
    expect(screen.queryByText(/import a deck/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/import anki \/ json/i)).not.toBeInTheDocument();
  });
});
