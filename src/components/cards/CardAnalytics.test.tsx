import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card, LegacyDeckRecord } from '../../db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../../fsrs/params';
import { CardAnalytics } from './CardAnalytics';

vi.mock('../analytics/useChartColours', () => ({
  useChartColours: () => ({
    accent: 'blue',
    ink: 'black',
    inkFaint: 'grey',
    line: 'silver',
    positive: 'green',
    surface: 'white',
  }),
}));

vi.mock('recharts', () => ({
  Area: () => null,
  CartesianGrid: () => null,
  ComposedChart: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Scatter: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const NOW = Date.UTC(2026, 7, 31, 12);

function makeCard(): Card {
  return {
    id: 'card-1',
    conceptId: 'concept-1',
    deckId: 'deck-1',
    schedulingUnitId: 'deck-1',
    type: 'front_back',
    front: 'Question',
    back: 'Answer',
    stability: 4,
    difficulty: 5,
    lastReviewed: NOW - MS_PER_DAY,
    reps: 1,
    lapses: 0,
    state: 2,
    due: NOW + MS_PER_DAY,
    scheduledDays: 1,
    learningSteps: 0,
    history: [],
    createdAt: NOW - MS_PER_DAY,
    updatedAt: NOW,
  };
}

function makeSchedulingConfig(examDate: number): LegacyDeckRecord {
  return {
    id: 'deck-1',
    name: 'Course',
    examDate,
    createdAt: NOW - MS_PER_DAY,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
  };
}

afterEach(() => vi.useRealTimers());

describe('CardAnalytics', () => {
  it('labels a passed exam as a maintenance target', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    render(
      <CardAnalytics
        card={makeCard()}
        schedulingConfig={makeSchedulingConfig(NOW - MS_PER_DAY)}
      />,
    );

    expect(screen.getByText('Predicted target R')).toBeInTheDocument();
    expect(screen.queryByText('Predicted exam R')).not.toBeInTheDocument();
  });
});
