import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CardSections,
  useCardSectionActivity,
  useCardSectionPreviouslyMounted,
} from './CardSections';

const viewport = vi.hoisted(() => ({ index: 0 }));
vi.mock('../../hooks/useVirtualList', () => ({
  useVirtualList: ({
    itemCount,
    pinnedIndices = [],
  }: {
    itemCount: number;
    pinnedIndices?: number[];
  }) => ({
    totalHeight: itemCount * 100,
    virtualItems: [...new Set([viewport.index, ...pinnedIndices])].map((index) => ({
      index,
      start: index * 100,
    })),
    measureRef: () => () => {},
    containerRef: { current: null },
  }),
}));

const sections = Array.from({ length: 100 }, (_, index) => String(index));
function Interactive({ id }: { id: string }) {
  const [active, setActive] = useState(false);
  useCardSectionActivity(active);
  const previouslyMounted = useCardSectionPreviouslyMounted();
  return (
    <div>
      <span data-testid={`row-${id}`}>
        {previouslyMounted ? 'Already entered' : 'First entrance'}
      </span>
      <button onClick={() => setActive(!active)}>{`${active ? 'Close' : 'Open'} ${id}`}</button>
      {active && <input aria-label={`Draft ${id}`} />}
    </div>
  );
}
function Fixture({
  nested = false,
  sectionIds = sections,
  cardCount = 1000,
  entranceWindowMs,
}: {
  nested?: boolean;
  sectionIds?: string[];
  cardCount?: number;
  entranceWindowMs?: number;
}) {
  return (
    <CardSections
      sections={sectionIds}
      cardCount={cardCount}
      sectionKey={(id) => id}
      entranceWindowMs={entranceWindowMs}
    >
      {(id, _index, previouslyMounted) =>
        nested ? (
          <CardSections sections={sections} cardCount={1000} sectionKey={(group) => group}>
            {(group) => <Interactive id={`${id}-${group}`} />}
          </CardSections>
        ) : (
          <div data-testid={`section-${id}`} data-revisit={previouslyMounted}>
            <Interactive id={id} />
          </div>
        )
      }
    </CardSections>
  );
}

describe('CardSections', () => {
  beforeEach(() => {
    viewport.index = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it('does not start an entrance on the first visit to a section after the list arrival window', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const { rerender } = render(<Fixture />);
    expect(screen.getByTestId('row-0')).toHaveTextContent('First entrance');
    clock.mockReturnValue(1500);
    viewport.index = 99;
    rerender(<Fixture />);
    expect(screen.getByTestId('section-99')).toHaveAttribute('data-revisit', 'true');
    expect(screen.getByTestId('row-99')).toHaveTextContent('Already entered');
  });

  it("keeps the caller's scaled arrival window and shares its clock with newly mounted nested groups", () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const { rerender } = render(<Fixture entranceWindowMs={1078} />);
    clock.mockReturnValue(1500);
    viewport.index = 99;
    rerender(<Fixture entranceWindowMs={1078} />);
    expect(screen.getByTestId('section-99')).toHaveAttribute('data-revisit', 'false');
    rerender(<Fixture nested entranceWindowMs={1078} />);
    expect(screen.getByTestId('row-99-99')).toHaveTextContent('Already entered');
    clock.mockReturnValue(2100);
    viewport.index = 98;
    rerender(<Fixture nested entranceWindowMs={1078} />);
    expect(screen.getByTestId('row-98-98')).toHaveTextContent('Already entered');
  });
  it('evicts idle sections and prevents both lesson and row entrances from replaying on return', () => {
    const { rerender } = render(<Fixture />);
    expect(screen.getByTestId('section-0')).toHaveAttribute('data-revisit', 'false');
    expect(screen.getByTestId('row-0')).toHaveTextContent('First entrance');
    viewport.index = 99;
    rerender(<Fixture />);
    expect(screen.queryByTestId('section-0')).not.toBeInTheDocument();
    viewport.index = 0;
    rerender(<Fixture />);
    expect(screen.getByTestId('section-0')).toHaveAttribute('data-revisit', 'true');
    expect(screen.getByTestId('row-0')).toHaveTextContent('Already entered');
  });

  it('pins an active nested group and its lesson, retaining the draft and focus until closed', () => {
    const { rerender } = render(<Fixture nested />);
    fireEvent.click(screen.getByText('Open 0-0'));
    const draft = screen.getByLabelText('Draft 0-0');
    fireEvent.change(draft, { target: { value: 'Unfinished tag' } });
    draft.focus();
    viewport.index = 99;
    rerender(<Fixture nested />);
    expect(screen.getByLabelText('Draft 0-0')).toBe(draft);
    expect(draft).toHaveValue('Unfinished tag');
    expect(draft).toHaveFocus();
    expect(screen.getByTestId('row-99-99')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close 0-0'));
    expect(screen.queryByTestId('row-0-0')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^row-/)).toHaveLength(1);
  });

  it('keeps matching interaction state when search crosses the windowing threshold', () => {
    const { rerender } = render(<Fixture />);
    fireEvent.click(screen.getByText('Open 0'));
    const draft = screen.getByLabelText('Draft 0');
    fireEvent.change(draft, { target: { value: 'Unfinished tag' } });
    draft.focus();
    rerender(<Fixture sectionIds={['0']} cardCount={1} />);
    expect(screen.getByLabelText('Draft 0')).toBe(draft);
    expect(draft).toHaveValue('Unfinished tag');
    expect(draft).toHaveFocus();
    rerender(<Fixture />);
    expect(screen.getByLabelText('Draft 0')).toBe(draft);
    expect(draft).toHaveFocus();
  });
});
