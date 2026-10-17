import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartCard } from './ChartCard';

describe('ChartCard data access', () => {
  it('offers the plotted values in a labelled table on demand', () => {
    render(
      <ChartCard
        title="Review volume"
        data={{ columns: ['Date', 'Reviews'], rows: [['26 Sep', 12]] }}
      >
        Chart
      </ChartCard>,
    );
    const disclosure = screen.getByRole('button', { name: 'View data' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const table = screen.getByRole('table', { name: 'Review volume' });
    expect(within(table).getByRole('columnheader', { name: 'Reviews' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '12' })).toBeInTheDocument();
    expect(document.getElementById(disclosure.getAttribute('aria-controls')!)).toContainElement(
      table,
    );
    fireEvent.click(disclosure);
    expect(table.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(disclosure);
    expect(screen.getByRole('table')).toBe(table);
  });

  it('keeps an empty state free of an empty data disclosure', () => {
    render(
      <ChartCard title="Review volume" empty data={{ columns: ['Date', 'Reviews'], rows: [] }}>
        Chart
      </ChartCard>,
    );
    expect(screen.queryByText('View data')).not.toBeInTheDocument();
  });

  it('offers its action only once the chart has data', () => {
    const { rerender } = render(
      <ChartCard title="Leeches" action={<a href="/search?filter=leech">Show leech cards</a>}>
        Chart
      </ChartCard>,
    );
    expect(screen.getByRole('link', { name: 'Show leech cards' })).toBeInTheDocument();
    rerender(
      <ChartCard title="Leeches" empty action={<a href="/search?filter=leech">Show leech cards</a>}>
        Chart
      </ChartCard>,
    );
    expect(screen.queryByRole('link', { name: 'Show leech cards' })).not.toBeInTheDocument();
  });
});
