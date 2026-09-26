import type * as Recharts from 'recharts';
import { cloneElement, type ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card, LegacyDeckRecord } from '../../db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../../fsrs/params';
import { forgettingCurve } from '../../fsrs/forwardSim';
import { decayOf } from '../../fsrs/fsrs';
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

vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof Recharts>()),
  // Happy DOM has no layout; keep the real chart and supply its measured size.
  ResponsiveContainer: ({ children }: { children: ReactElement }) =>
    cloneElement(children as ReactElement<{ width: number; height: number }>, {
      width: 800,
      height: 192,
    }),
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CardAnalytics', () => {
  it('labels a passed exam as a maintenance target', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    render(
      <CardAnalytics card={makeCard()} schedulingConfig={makeSchedulingConfig(NOW - MS_PER_DAY)} />,
    );

    expect(screen.getByText('Predicted target R')).toBeInTheDocument();
    expect(screen.queryByText('Predicted exam R')).not.toBeInTheDocument();
  });
});

// Exercise Recharts' real pointer, payload and active-dot selection together.
describe('forgetting curve hover', () => {
  it.each([false, true])(
    'shows the hovered date and recall with review history: %s',
    async (withHistory) => {
      const card = makeCard();
      if (withHistory) {
        card.history = [
          {
            timestamp: card.lastReviewed!,
            grade: 3,
            responseTimeSec: 12,
            distracted: false,
            stabilityBefore: 2,
            stabilityAfter: 4,
            difficultyBefore: 5,
            difficultyAfter: 5,
            retrievabilityAtReview: 0.8,
          },
        ];
      }
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const { container } = render(
        <CardAnalytics
          card={card}
          schedulingConfig={makeSchedulingConfig(NOW + 6 * MS_PER_DAY)}
          motionMultiplier={0}
        />,
      );
      if (withHistory) {
        const marker = container.querySelector('.recharts-reference-dot circle')!;
        expect(Number(marker.getAttribute('cx'))).toBeCloseTo(36, 0);
        expect(Number(marker.getAttribute('cy'))).toBeCloseTo(38.8, 0);
      }
      const chart = container.querySelector('.recharts-wrapper')!;
      vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 800,
        bottom: 192,
        width: 800,
        height: 192,
        toJSON: () => ({}),
      });
      Object.defineProperty(chart, 'offsetWidth', { value: 800, configurable: true });
      Object.defineProperty(chart, 'offsetHeight', { value: 192, configurable: true });
      // Plot spans x=36..788 and 21 days. Hover day 7, then day 14.
      for (const [days, expectedDate] of [
        [7, '6 Sept 2026'],
        [14, '13 Sept 2026'],
      ] as const) {
        const x = 36 + (752 * days) / 21;
        fireEvent.mouseMove(chart, { clientX: x, clientY: 70 });
        await waitFor(() => {
          const tooltip = container.querySelector('.recharts-tooltip-wrapper')!;
          expect(tooltip).toHaveTextContent(expectedDate);
          expect(tooltip).toHaveTextContent('Predicted recall');
          const recall = Math.round(
            forgettingCurve(days, card.stability!, decayOf(defaultFsrsParameters())) * 100,
          );
          expect(tooltip).toHaveTextContent(`${recall}%`);
          const dot = container.querySelector('.recharts-active-dot circle')!;
          expect(Number(dot.getAttribute('cx'))).toBeCloseTo(x, 0);
        });
      }
    },
  );
});
