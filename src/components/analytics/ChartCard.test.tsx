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
    fireEvent.click(screen.getByText('View data'));
    const table = screen.getByRole('table', { name: 'Review volume' });
    expect(within(table).getByRole('columnheader', { name: 'Reviews' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '12' })).toBeInTheDocument();
  });

  it('keeps an empty state free of an empty data disclosure', () => {
    render(
      <ChartCard title="Review volume" empty data={{ columns: ['Date', 'Reviews'], rows: [] }}>
        Chart
      </ChartCard>,
    );
    expect(screen.queryByText('View data')).not.toBeInTheDocument();
  });
});
