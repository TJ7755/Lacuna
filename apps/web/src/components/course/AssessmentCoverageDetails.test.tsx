import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Card, CourseAssessment, Lesson } from '@lacuna/core/db/types';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import { AssessmentCoverageDetails } from './AssessmentCoverageDetails';

const lesson: Lesson = {
  id: 'l1',
  courseId: 'c1',
  name: 'Atoms',
  orderIndex: 0,
  isExtension: false,
  createdAt: 1,
  updatedAt: 1,
};
const card = {
  id: 'card-1',
  conceptId: 'concept-card-1',
  courseId: 'c1',
  primaryLessonId: 'l1',
  deckId: 'd1',
  schedulingUnitId: 'd1',
  front: 'What is a proton?',
  back: 'Positive',
  type: 'front_back',
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  state: 0,
  stability: null,
  difficulty: null,
  due: 0,
  scheduledDays: 0,
  learningSteps: 0,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  history: [],
} as Card;
const assessment: CourseAssessment = {
  id: 'a1',
  courseId: 'c1',
  name: 'Paper 1',
  kind: 'checkpoint',
  examDate: 2_000_000_000_000,
  afterLessonId: 'l1',
  coverageMode: 'prefix',
  excludedCardIds: ['card-1'],
  createdAt: 1,
  updatedAt: 1,
};

it('retains resolved lesson coverage and excluded card identities in the compact details', () => {
  render(
    <AssessmentCoverageDetails
      assessment={assessment}
      cards={[card]}
      resolved={resolveAssessmentCoverage(assessment, [lesson], [card], [])}
    />,
  );
  expect(screen.getByText('Atoms')).toBeVisible();
  expect(screen.getByText('What is a proton?')).toBeVisible();
  expect(screen.getByText('1 lesson, 0 cards')).toBeVisible();
  expect(screen.queryByText('Needs author review')).not.toBeInTheDocument();
});
