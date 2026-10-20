import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../state/ThemeContext';
import { LibraryPage } from './LibraryPage';
import type { LibraryCourse } from './catalogue';

const biologyUrl = 'https://getlacuna.app/#/s/0123456789abcdef0123456789abcdef';
const physicsUrl = 'https://getlacuna.app/#/s/abcdef0123456789abcdef0123456789';
const courses: readonly LibraryCourse[] = [
  {
    id: 'biology',
    subject: 'Biology',
    board: 'AQA',
    qualification: 'AQA GCSE',
    code: '8461',
    summary: 'Explore living systems from cells to ecosystems.',
    topics: ['Cell biology', 'Ecology'],
    shareUrl: biologyUrl,
    stats: { cards: 1200, notes: 80, practiceSets: 40, practiceMarks: 100 },
  },
  {
    id: 'physics',
    subject: 'Physics',
    board: 'OCR',
    qualification: 'OCR GCSE',
    code: 'J249',
    summary: 'Explore energy, forces and matter.',
    topics: ['Energy', 'Forces'],
    shareUrl: physicsUrl,
    stats: { cards: 600, notes: 60, practiceSets: 30, practiceMarks: 75 },
  },
];

function renderLibrary(data: readonly LibraryCourse[] = courses) {
  return render(
    <ThemeProvider>
      <LibraryPage courses={data} />
    </ThemeProvider>,
  );
}

const cover = (subject: string) =>
  screen.getByRole('button', { name: new RegExp(`^.*${subject}`) });

describe('LibraryPage', () => {
  // Happy DOM cancels Web Animations with an unhandled rejection, so these tests run reduced.
  beforeEach(() => {
    const matchMedia = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const list = matchMedia(query);
      if (query !== '(prefers-reduced-motion: reduce)') return list;
      Object.defineProperty(list, 'matches', { value: true });
      return list;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows every course as a cover with its counts and no link until it is opened', () => {
    renderLibrary();
    expect(cover('Biology')).toHaveAttribute('aria-expanded', 'false');
    expect(within(cover('Biology')).getByText('1,200 cards')).toBeInTheDocument();
    expect(within(cover('Physics')).getByText('60 lesson notes')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open in Lacuna/ })).not.toBeInTheDocument();
  });

  it('expands a cover into its course and returns to it when closed', async () => {
    renderLibrary();
    const physics = cover('Physics');
    physics.focus();
    fireEvent.click(physics);

    const sheet = await screen.findByRole('dialog', { name: 'Physics' });
    expect(physics).toHaveAttribute('aria-expanded', 'true');
    expect(within(sheet).getByText('OCR GCSE · J249')).toBeInTheDocument();
    expect(within(sheet).getByText('Explore energy, forces and matter.')).toBeInTheDocument();
    expect(within(sheet).getByText('30 practice sets, 75 marks')).toBeInTheDocument();
    expect(within(sheet).getByText('Forces')).toBeInTheDocument();
    expect(within(sheet).queryByText('Ecology')).not.toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: /Open in Lacuna/ })).toHaveAttribute(
      'href',
      physicsUrl,
    );
    await waitFor(() =>
      expect(within(sheet).getByRole('heading', { name: 'Physics' })).toHaveFocus(),
    );

    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(physics).toHaveAttribute('aria-expanded', 'false');
    expect(physics).toHaveFocus();
  });

  it('shows no review or progress status', async () => {
    renderLibrary();
    fireEvent.click(cover('Biology'));
    await screen.findByRole('dialog', { name: 'Biology' });
    expect(screen.queryByText(/review|progress/i)).not.toBeInTheDocument();
  });

  it('filters the covers by exam board', () => {
    renderLibrary();
    fireEvent.click(screen.getByRole('radio', { name: 'OCR' }));
    expect(screen.queryByRole('button', { name: /Biology/ })).not.toBeInTheDocument();
    expect(cover('Physics')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(cover('Biology')).toBeInTheDocument();
  });

  it('offers no board filter when every course shares one board', () => {
    renderLibrary([courses[0], { ...courses[1], board: 'AQA' }]);
    expect(screen.queryByRole('radiogroup', { name: 'Exam board' })).not.toBeInTheDocument();
  });

  it('provides no course link when a course has not been published', async () => {
    renderLibrary([{ ...courses[0], shareUrl: null }]);
    fireEvent.click(cover('Biology'));
    const sheet = await screen.findByRole('dialog', { name: 'Biology' });
    expect(within(sheet).getByRole('button', { name: 'Available soon' })).toBeDisabled();
    expect(within(sheet).queryByRole('link', { name: /Open in Lacuna/ })).not.toBeInTheDocument();
  });

  it('does not turn an invalid configured URL into a link', async () => {
    renderLibrary([{ ...courses[0], shareUrl: 'https://example.com/course' }]);
    fireEvent.click(cover('Biology'));
    const sheet = await screen.findByRole('dialog', { name: 'Biology' });
    expect(within(sheet).getByRole('button', { name: 'Available soon' })).toBeDisabled();
    expect(within(sheet).queryByRole('link', { name: /Open in Lacuna/ })).not.toBeInTheDocument();
  });

  it('switches the theme through the shared theme provider', () => {
    localStorage.setItem('lacuna-theme', 'light');
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }));
    expect(document.documentElement).toHaveClass('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('omits unknown counts', async () => {
    renderLibrary([{ ...courses[0], stats: undefined }]);
    expect(screen.queryByText(/\d cards/)).not.toBeInTheDocument();
    fireEvent.click(cover('Biology'));
    const sheet = await screen.findByRole('dialog', { name: 'Biology' });
    expect(within(sheet).queryByText(/practice sets/)).not.toBeInTheDocument();
  });

  it('explains an empty library', () => {
    renderLibrary([]);
    expect(screen.getByRole('heading', { name: 'Courses are on their way' })).toBeInTheDocument();
  });
});
