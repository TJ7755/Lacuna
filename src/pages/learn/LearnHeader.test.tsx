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
      onOpenNav={action}
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
  expect(pips[0]).toHaveClass('bg-positive', 'border-accent');
  expect(pips[1]).toHaveAttribute('data-session-card-status', 'wrong');
  expect(pips[1]).toHaveClass('bg-negative', 'border-accent');
  expect(pips[2]).toHaveAttribute('data-session-card-status', 'current');
});

it("names the current card's place in Simple Learn's pip bar, not the cards cleared", () => {
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
    onOpenNav: action,
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
  render(<LearnHeader {...props} />);
  expect(screen.getByText('· 4 of 4')).toBeInTheDocument();
  expect(screen.getByText('Card 4 of 4')).toBeInTheDocument();
});
