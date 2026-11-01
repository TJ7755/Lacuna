import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../state/ThemeContext';
import { LibraryPage } from './LibraryPage';
import { libraryCourses, type LibraryCourse } from './catalogue';

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
    author: 'Test author',
    publisher: 'Test publisher',
    revision: 7,
    revisionDate: '2026-10-01',
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

  it.each([['History', '0977', '0470']])(
    'finds %s by either syllabus code and shows both on its cover and sheet',
    async (subject, primary, alternative) => {
      renderLibrary(libraryCourses);
      const search = screen.getByRole('searchbox', { name: 'Search courses' });
      for (const code of [primary, alternative]) {
        fireEvent.change(search, { target: { value: code } });
        const course = cover(subject);
        expect(course).toHaveTextContent(primary);
        expect(course).toHaveTextContent(alternative);
        expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(1);
      }
      fireEvent.click(cover(subject));
      const sheet = await screen.findByRole('dialog', { name: subject });
      expect(sheet).toHaveTextContent(primary);
      expect(sheet).toHaveTextContent(alternative);
    },
  );

  it.each(['0972', '0625'])('finds a distinct Physics download for syllabus %s', async (code) => {
    renderLibrary(libraryCourses);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search courses' }), {
      target: { value: code },
    });
    const physics = cover('Physics');
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(1);
    expect(physics).toHaveTextContent(code);
    expect(physics).not.toHaveTextContent(code === '0972' ? '0625' : '0972');
    fireEvent.click(physics);
    const sheet = await screen.findByRole('dialog', { name: 'Physics' });
    expect(sheet).toHaveTextContent(code);
    expect(sheet).not.toHaveTextContent(code === '0972' ? '0625' : '0972');
  });

  it.each(['8464', '1SC0', 'J250'])(
    'does not list withdrawn Combined Science course %s',
    (code) => {
      renderLibrary(libraryCourses);
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search courses' }), {
        target: { value: code },
      });
      expect(screen.queryByRole('button', { name: /Combined Science/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Open in Lacuna/ })).not.toBeInTheDocument();
    },
  );

  it('finds Religious Studies by code and shows its published scope, counts and link', async () => {
    renderLibrary(libraryCourses);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search courses' }), {
      target: { value: '8062' },
    });
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(1);
    fireEvent.click(cover('Religious Studies'));
    const sheet = await screen.findByRole('dialog', { name: 'Religious Studies' });
    expect(sheet).toHaveTextContent('AQA GCSE · 8062');
    expect(sheet).toHaveTextContent('optional Themes A–F modules');
    expect(sheet).toHaveTextContent('1, 1, 4 and 6-mark question styles');
    expect(sheet).toHaveTextContent('1,272 cards');
    expect(sheet).toHaveTextContent('126 lesson notes');
    expect(sheet).toHaveTextContent('126 practice sets, 1,656 marks');
    expect(within(sheet).getByRole('link', { name: /Open in Lacuna/ })).toHaveAttribute(
      'href',
      'https://getlacuna.app/#/s/e85fc39e709074d58669c2d8bfd723bb',
    );
  });

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

  it('shows provenance and reports only course identity and a chosen item reference', async () => {
    localStorage.setItem('learner-progress', 'private study history');
    renderLibrary();
    fireEvent.click(cover('Biology'));
    const sheet = await screen.findByRole('dialog', { name: 'Biology' });
    const provenance = within(sheet).getByRole('region', { name: 'Course provenance' });
    expect(within(provenance).getByText('Test author')).toBeInTheDocument();
    expect(within(provenance).getByText('Test publisher')).toBeInTheDocument();
    expect(within(provenance).getByText('7')).toBeInTheDocument();
    expect(within(provenance).getByText('1 October 2026')).toHaveAttribute(
      'datetime',
      '2026-10-01',
    );
    const report = within(provenance).getByRole('link', { name: 'Report a mistake' });
    const url = new URL(report.getAttribute('href')!);
    expect(url.origin + url.pathname).toBe('https://github.com/TJ7755/Lacuna/issues/new');
    expect([...url.searchParams]).toEqual([
      ['title', 'Course mistake: biology'],
      ['body', 'Course: biology\nRevision: 7'],
    ]);
    fireEvent.change(
      within(provenance).getByRole('textbox', { name: 'Item reference (optional)' }),
      {
        target: { value: 'note: cells & tissues #3' },
      },
    );
    expect([...new URL(report.getAttribute('href')!).searchParams]).toEqual([
      ['title', 'Course mistake: biology'],
      ['body', 'Course: biology\nRevision: 7\nItem reference: note: cells & tissues #3'],
    ]);
  });

  it('filters the covers by exam board', () => {
    renderLibrary();
    fireEvent.click(screen.getByRole('radio', { name: 'OCR' }));
    expect(screen.queryByRole('button', { name: /Biology/ })).not.toBeInTheDocument();
    expect(cover('Physics')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(cover('Biology')).toBeInTheDocument();
  });

  it('omits unknown provenance without guessing and keeps reporting available', async () => {
    renderLibrary([{ ...courses[1], author: undefined, publisher: undefined }]);
    fireEvent.click(cover('Physics'));
    const sheet = await screen.findByRole('dialog', { name: 'Physics' });
    const provenance = within(sheet).getByRole('region', { name: 'Course provenance' });
    expect(provenance.querySelectorAll('dt')).toHaveLength(0);
    const report = within(provenance).getByRole('link', { name: 'Report a mistake' });
    expect([...new URL(report.getAttribute('href')!).searchParams]).toEqual([
      ['title', 'Course mistake: physics'],
      ['body', 'Course: physics'],
    ]);
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
