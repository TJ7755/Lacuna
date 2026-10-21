import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseForecastCard } from './CourseForecastCard';
import { defaultFsrsParameters, FSRS_VERSION } from '../../fsrs/params';
import type { Card, Course } from '../../db/types';

const DAY = 86_400_000;

const course = {
  id: 'course-1',
  name: 'Mathematics',
  description: '',
  createdAt: 0,
  updatedAt: 0,
  examDate: Date.now() + 30 * DAY,
  fsrsVersion: FSRS_VERSION,
  fsrsParameters: defaultFsrsParameters(),
  examObjective: 'expectedMarks',
  unlockMode: 'open',
  autoPractice: false,
  practiceThresholdMinutesFar: 12,
  practiceThresholdMinutesNear: 6,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
} as Course;

function reviewedCard(): Card {
  return {
    id: 'card-1',
    deckId: 'course-1',
    courseId: 'course-1',
    schedulingUnitId: 'course-1',
    conceptId: 'concept-1',
    type: 'front_back',
    front: 'Q',
    back: 'A',
    stability: 12,
    difficulty: 5,
    lastReviewed: Date.now() - DAY,
    reps: 3,
    lapses: 0,
    state: 2,
    due: Date.now() + 10 * DAY,
    scheduledDays: 11,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    updatedAt: 0,
  } as Card;
}

describe('CourseForecastCard', () => {
  it('draws the dashboard forecast with the course as its one line', () => {
    render(
      <CourseForecastCard course={course} lessons={[]} cards={[reviewedCard()]} history={[]} multiplier={0} />,
    );

    expect(screen.getByRole('heading', { name: 'Exam-day forecast' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mathematics/ })).toBeInTheDocument();
  });

  it('shows exam-day recall if study stopped now, so an unstudied course reads 0%', () => {
    const unstudied = {
      ...reviewedCard(),
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      state: 0,
      due: null,
    } as Card;
    render(
      <CourseForecastCard
        course={course}
        lessons={[]}
        cards={[unstudied]}
        history={[]}
        multiplier={0}
      />,
    );

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders nothing for a course with no cards to forecast', () => {
    const { container } = render(
      <CourseForecastCard course={course} lessons={[]} cards={[]} history={[]} multiplier={0} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
