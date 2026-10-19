import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../state/ThemeContext';
import { LibraryPage } from './LibraryPage';
import type { LibraryCourse } from './catalogue';

const biologyUrl = 'https://getlacuna.app/#/s/0123456789abcdef0123456789abcdef';
const physicsUrl = 'https://getlacuna.app/#/s/abcdef0123456789abcdef0123456789';
const courses: readonly LibraryCourse[] = [
  {
    id: 'biology',
    subject: 'Biology',
    qualification: 'AQA GCSE',
    code: '8461',
    summary: 'Explore living systems from cells to ecosystems.',
    topics: ['Cell biology', 'Ecology'],
    shareUrl: biologyUrl,
  },
  {
    id: 'physics',
    subject: 'Physics',
    qualification: 'AQA GCSE',
    code: '8463',
    summary: 'Explore energy, forces and matter.',
    topics: ['Energy', 'Forces'],
    shareUrl: physicsUrl,
  },
];

function renderLibrary(data: readonly LibraryCourse[] = courses) {
  return render(
    <ThemeProvider>
      <LibraryPage courses={data} />
    </ThemeProvider>,
  );
}

describe('LibraryPage', () => {
  it('previews Biology first and changes the complete preview when another course is chosen', () => {
    renderLibrary();
    const biology = screen.getByRole('button', { name: /Biology/ });
    const physics = screen.getByRole('button', { name: /Physics/ });
    expect(biology).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Biology' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Lacuna' })).toHaveAttribute(
      'href',
      biologyUrl,
    );

    physics.focus();
    expect(physics).toHaveFocus();
    fireEvent.click(physics, { detail: 0 });

    expect(physics).toHaveAttribute('aria-pressed', 'true');
    expect(biology).toHaveAttribute('aria-pressed', 'false');
    const preview = screen.getByRole('region', { name: 'Physics' });
    expect(within(preview).getByText('8463')).toBeInTheDocument();
    expect(within(preview).getByText('Explore energy, forces and matter.')).toBeInTheDocument();
    expect(within(preview).getByText('Forces')).toBeInTheDocument();
    expect(within(preview).queryByText('Ecology')).not.toBeInTheDocument();
    expect(within(preview).getByRole('link', { name: 'Open in Lacuna' })).toHaveAttribute(
      'href',
      physicsUrl,
    );
    expect(physics).toHaveFocus();
  });

  it('provides no course link when a course has not been published', () => {
    renderLibrary([{ ...courses[0], shareUrl: null }]);
    expect(screen.getByRole('button', { name: 'Available soon' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Open in Lacuna' })).not.toBeInTheDocument();
  });

  it('does not turn an invalid configured URL into a link', () => {
    renderLibrary([{ ...courses[0], shareUrl: 'https://example.com/course' }]);
    expect(screen.getByRole('button', { name: 'Available soon' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Open in Lacuna' })).not.toBeInTheDocument();
  });

  it('switches the theme through the shared theme provider', () => {
    localStorage.setItem('lacuna-theme', 'light');
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }));
    expect(document.documentElement).toHaveClass('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
