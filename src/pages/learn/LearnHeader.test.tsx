import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LearnHeader } from './LearnHeader';

type HeaderProps = React.ComponentProps<typeof LearnHeader>;

it('keeps results coloured while those lines are recited again', () => {
  const action = vi.fn();
  render(
    <LearnHeader
      mode="simple"
      plannedRevision={false}
      revisionSecondsRemaining={0}
      revisionWindowBudgetSeconds={0}
      singleDeck={null}
      unitDisplayName={null}
      sessionProgress={1 / 3}
      predictedRecall={0}
      sessionCardIds={['one', 'two', 'three']}
      sessionCardOutcomes={
        new Map([
          ['one', 'correct'],
          ['two', 'wrong'],
        ])
      }
      currentCardIds={['one', 'two', 'three']}
      filterParams={[]}
      tagFilter={null}
      onExit={action}
      focusMode={false}
      onToggleFocus={action}
      onToggleFullscreen={action}
      isFullscreen={false}
      onPointerLeave={action}
      menuOpen={false}
      setMenuOpen={action}
      current={null}
      isTouchMode={false}
      onEdit={action}
      onToggleFlag={action}
      onBury={action}
      onSuspend={action}
      onShowShortcuts={action}
      m={0}
    />,
  );
  const pips = screen.getByRole('progressbar').querySelectorAll('[data-session-card-status]');
  expect(pips[0]).toHaveAttribute('data-session-card-status', 'correct');
  expect(pips[0]).toHaveClass('border-accent');
  expect(pips[0].firstElementChild).toHaveClass('bg-positive');
  expect(pips[1]).toHaveAttribute('data-session-card-status', 'wrong');
  expect(pips[1]).toHaveClass('border-accent');
  expect(pips[1].firstElementChild).toHaveClass('bg-negative');
  expect(pips[2]).toHaveAttribute('data-session-card-status', 'current');
});

it("names the current card's place in Simple Learn's pip bar, not the cards cleared", () => {
  const props = headerProps();
  render(<LearnHeader {...props} />);
  expect(screen.getByText('· 4 of 4')).toBeInTheDocument();
  expect(screen.getByText('Card 4 of 4')).toBeInTheDocument();
});

function headerProps(): HeaderProps {
  const action = vi.fn();
  const props: HeaderProps = {
    mode: 'simple',
    plannedRevision: false,
    revisionSecondsRemaining: 0,
    revisionWindowBudgetSeconds: 0,
    singleDeck: null,
    unitDisplayName: null,
    // Two of four cleared, but a failed card has come back round, so the learner is on the fourth.
    sessionProgress: 2 / 4,
    predictedRecall: 0,
    sessionCardIds: ['one', 'two', 'three', 'four'],
    sessionCardOutcomes: new Map([
      ['one', 'wrong'],
      ['two', 'correct'],
      ['three', 'correct'],
    ]),
    currentCardIds: ['four'],
    filterParams: [],
    tagFilter: null,
    onExit: action,
    focusMode: false,
    onToggleFocus: action,
    onToggleFullscreen: action,
    isFullscreen: false,
    onPointerLeave: action,
    menuOpen: false,
    setMenuOpen: action,
    current: null,
    isTouchMode: false,
    onEdit: action,
    onToggleFlag: action,
    onBury: action,
    onSuspend: action,
    onShowShortcuts: action,
    m: 0,
  };
  return props;
}

it.each([false, true])(
  'keeps the forecast in the actions menu (touch: %s)',
  async (isTouchMode) => {
    const { createCard, createCourse } = await import('../../db/repository');
    const course = await createCourse('French beginner to advanced');
    const current = await createCard(course.id, 'front_back', 'Question', 'Answer', []);
    const props = {
      ...headerProps(),
      mode: 'fsrs' as const,
      singleDeck: course,
      unitDisplayName: course.name,
      current,
      predictedRecall: 0.75,
      isTouchMode,
    };
    const { rerender } = render(<LearnHeader {...props} />);
    expect(screen.queryByText(/75% forecast recall/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: course.name })).toBeVisible();
    rerender(<LearnHeader {...props} menuOpen />);
    expect(screen.getByText(/75% forecast recall/)).toBeVisible();
    for (const [name, description] of [
      ['Flag card', 'Find it later; its schedule is unchanged.'],
      ['Bury until tomorrow', 'Back tomorrow.'],
      ['Suspend card', 'Out of study until you resume it.'],
    ]) {
      expect(screen.getByRole('button', { name })).toHaveAccessibleDescription(description);
    }
  },
);

it.each([false, true])('has no navigation opener (touch: %s)', (isTouchMode) => {
  render(<LearnHeader {...headerProps()} isTouchMode={isTouchMode} />);
  expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Card actions' })).toBeInTheDocument();
});

it('fills Simple Learn outcomes through a transform layer, including reduced motion', () => {
  render(<LearnHeader {...headerProps()} />);
  const pips = screen.getByRole('progressbar').querySelectorAll('[data-session-card-status]');
  expect(pips[0].firstElementChild).toHaveClass('bg-negative');
  expect(pips[1].firstElementChild).toHaveClass('bg-positive');
  expect(pips[3].firstElementChild).toHaveStyle({ transform: 'scaleX(0)' });
});
