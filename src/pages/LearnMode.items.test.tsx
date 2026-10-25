import 'fake-indexeddb/auto';
import { storedReviewsForCard, resetLearnModeFixtures } from './LearnMode.testFixtures';
import { LearnMode } from './LearnMode';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createCard, createCourse } from '../db/repository';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
describe('LearnMode items', () => {
  beforeEach(resetLearnModeFixtures);

  it('checks a numeric answer and records full marks without self-grading', async () => {
    const performanceNow = vi.spyOn(performance, 'now').mockReturnValue(0);
    const deck = await createCourse('Numeric deck');
    const card = await createCard(deck.id, 'front_back', 'What is 8 / 2?', '', [], {
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
    });

    try {
      render(
        <ThemeProvider>
          <AccentProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={['/learn']}>
                <Routes>
                  <Route path="/learn" element={<LearnMode />} />
                </Routes>
              </MemoryRouter>
            </ToastProvider>
          </AccentProvider>
        </ThemeProvider>,
      );

      fireEvent.change(await screen.findByLabelText('Your answer'), {
        target: { value: '8 / 2' },
      });
      expect(screen.queryByRole('button', { name: /^yes$/i })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
      fireEvent.click(screen.getByRole('button', { name: 'The checker got this wrong' }));
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(async () => {
        expect((await storedReviewsForCard(card.id))[0]).toMatchObject({
          grade: 4,
          correct: true,
          marksEarned: 1,
          marksAvailable: 1,
          checkerDisputes: [
            {
              question: 'What is 8 / 2?',
              studentLine: '8 / 2',
              verdict: { correct: true, marksEarned: 1 },
              checkerSeeds: [],
            },
          ],
        });
      });
      expect((await storedReviewsForCard(card.id))[0]).not.toHaveProperty('input');
    } finally {
      performanceNow.mockRestore();
    }
  });

  it('grades an incorrect numeric answer as Again and clears it for the next card', async () => {
    const deck = await createCourse('Numeric retry deck');
    const card = await createCard(deck.id, 'front_back', 'What is 3 squared?', '', [], {
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '9' } },
    });

    await createCard(deck.id, 'front_back', 'Next question', '', [], { payload: card.payload });
    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    const input = await screen.findByLabelText('Your answer');
    const reviewedId = document
      .querySelector('[data-study-card-id]')!
      .getAttribute('data-study-card-id')!;
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(async () => {
      expect((await storedReviewsForCard(reviewedId))[0]).toMatchObject({
        grade: 1,
        correct: false,
        marksEarned: 0,
        marksAvailable: 1,
      });
    });
    expect(await screen.findByLabelText('Your answer')).toHaveValue('');
    expect(document.querySelector('[data-study-card-id]')).not.toHaveAttribute(
      'data-study-card-id',
      reviewedId,
    );
  });

  it('checks working lines and persists full marks with their verdicts', async () => {
    const performanceNow = vi.spyOn(performance, 'now').mockReturnValue(0);
    const deck = await createCourse('Working deck');
    const card = await createCard(deck.id, 'front_back', 'Solve 2x = 8.', '', [], {
      payload: {
        v: 1,
        kind: 'working',
        scheme: [
          { marks: 1, label: 'substitution', kind: 'waypoint', expression: '2x = 8' },
          { marks: 2, label: 'answer', kind: 'predicate', predicate: 'equals', args: ['4'] },
        ],
      },
    });
    try {
      render(
        <ThemeProvider>
          <AccentProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={['/learn']}>
                <Routes>
                  <Route path="/learn" element={<LearnMode />} />
                </Routes>
              </MemoryRouter>
            </ToastProvider>
          </AccentProvider>
        </ThemeProvider>,
      );
      const working = await screen.findByLabelText('Your working');
      await waitFor(() => expect(working).toHaveFocus());
      fireEvent.change(working, {
        target: { value: '2x = 8\n4' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Check working' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'The checker got this wrong for line 1' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(async () => {
        expect((await storedReviewsForCard(card.id))[0]).toMatchObject({
          grade: 4,
          correct: true,
          marksEarned: 3,
          marksAvailable: 3,
          lineVerdicts: [
            { studentLine: '2x = 8', matchedLineIndex: 0, marksEarned: 1 },
            { studentLine: '4', matchedLineIndex: 1, marksEarned: 2 },
          ],
          checkerDisputes: [
            {
              question: 'Solve 2x = 8.',
              studentLine: '2x = 8',
              verdict: { correct: true, marksEarned: 1, matchedLineIndex: 0 },
              checkerSeeds: [`${card.id}:0:0`],
            },
          ],
        });
      });
    } finally {
      performanceNow.mockRestore();
    }
  });

  it('grades partial working as Again and clears it for the next card', async () => {
    const deck = await createCourse('Working retry deck');
    const card = await createCard(deck.id, 'front_back', 'Solve 2x = 8.', '', [], {
      payload: {
        v: 1,
        kind: 'working',
        scheme: [
          { marks: 1, label: 'substitution', kind: 'waypoint', expression: '2x = 8' },
          { marks: 2, label: 'answer', kind: 'predicate', predicate: 'equals', args: ['4'] },
        ],
      },
    });
    await createCard(deck.id, 'front_back', 'Next question', '', [], { payload: card.payload });
    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );
    await screen.findByLabelText('Your working');
    const reviewedId = document
      .querySelector('[data-study-card-id]')!
      .getAttribute('data-study-card-id')!;
    fireEvent.change(await screen.findByLabelText('Your working'), { target: { value: '2x = 8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check working' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(async () => {
      expect((await storedReviewsForCard(reviewedId))[0]).toMatchObject({
        grade: 1,
        correct: false,
        marksEarned: 1,
        marksAvailable: 3,
      });
    });
    expect(await screen.findByLabelText('Your working')).toHaveValue('');
    await waitFor(() => expect(screen.getByLabelText('Your working')).toHaveFocus());
    expect(document.querySelector('[data-study-card-id]')).not.toHaveAttribute(
      'data-study-card-id',
      reviewedId,
    );
  });

  it('renders a scaffold-kind item read-only, with no grading affordance and an empty history', async () => {
    const deck = await createCourse('Scaffold deck');
    const card = await createCard(deck.id, 'front_back', 'Solve 2x = 8 by scaffold.', '', [], {
      payload: { v: 1, kind: 'scaffold' },
    });

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Solve 2x = 8 by scaffold.')).toBeInTheDocument();
    expect(
      await screen.findByText(
        /can’t study this item yet — this version doesn’t support its format\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^yes$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^no$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show answer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    expect(await storedReviewsForCard(card.id)).toHaveLength(0);
  });

  it('falls back to the read-only face for an unknown payload version, not just an unknown kind', async () => {
    const deck = await createCourse('Unknown version deck');
    await createCard(deck.id, 'front_back', 'What is 8 / 2?', '', [], {
      // A hypothetical future `v: 2` numeric payload — the version guard, not the
      // kind check, is what must catch this.
      payload: { v: 2, kind: 'numeric', answer: { kind: 'exact', value: '4' } } as never,
    });

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('What is 8 / 2?')).toBeInTheDocument();
    expect(
      await screen.findByText(
        /can’t study this item yet — this version doesn’t support its format\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check answer' })).not.toBeInTheDocument();
  });

  it('buries a scaffold-kind item from its read-only face and advances the session', async () => {
    const deck = await createCourse('Scaffold bury deck');
    const card = await createCard(deck.id, 'front_back', 'Scaffold question', '', [], {
      payload: { v: 1, kind: 'scaffold' },
    });

    const { unmount } = render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Scaffold question')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Card actions' }));
    const bury = await screen.findByRole('button', { name: 'Bury until tomorrow' });
    await act(async () => {
      fireEvent.click(bury);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (screen.queryByText('Session complete')) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });

    expect(await screen.findByRole('heading', { name: 'Nice work' })).toBeInTheDocument();
    expect(await storedReviewsForCard(card.id)).toHaveLength(0);
    await act(async () => unmount());
  });
});
