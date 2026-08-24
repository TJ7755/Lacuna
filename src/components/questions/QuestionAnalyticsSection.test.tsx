import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  QuestionAnalytics,
  QuestionCriterionPerformance,
  QuestionPerformanceMetric,
} from '../../questions/analytics';
import { QuestionAnalyticsSection } from './QuestionAnalyticsSection';

function metric(
  attemptCount: number,
  fullCreditCount: number,
  marksEarned: number,
  marksAvailable: number,
): QuestionPerformanceMetric {
  return {
    attemptCount,
    fullCreditCount,
    marksEarned,
    marksAvailable,
    accuracy: attemptCount ? fullCreditCount / attemptCount : null,
    markRate: marksAvailable ? marksEarned / marksAvailable : null,
  };
}

function criterion(index: number): QuestionCriterionPerformance {
  return {
    id: `question-${index}:v1:criterion:${index}:Criterion ${index}`,
    questionId: `question-${index}`,
    contentVersion: 1,
    lineIndex: index,
    label: `Criterion ${index}`,
    opportunityCount: 1,
    fullCreditCount: index === 0 ? 1 : 0,
    marksEarned: index === 0 ? 1 : 0,
    marksAvailable: 1,
    accuracy: index === 0 ? 1 : 0,
    markRate: index === 0 ? 1 : 0,
  };
}

describe('QuestionAnalyticsSection', () => {
  it('renders retained attempt evidence after the final live Question is deleted', () => {
    const analytics: QuestionAnalytics = {
      inventory: { total: 0, due: 0, unseen: 0, suspended: 0 },
      fixed: {
        definitionCount: 0,
        presentedDefinitionCount: 0,
        exposureCoverage: null,
        firstPresentation: metric(1, 1, 2, 2),
        repeat: metric(0, 0, 0, 0),
      },
      generated: {
        definitionCount: 0,
        presentationCount: 0,
        uniqueVariantCount: 0,
        repeatedPresentationCount: 0,
        repeatRate: null,
        novel: metric(0, 0, 0, 0),
        repeated: metric(0, 0, 0, 0),
      },
      criteria: [criterion(0)],
      checkerDisputeCount: 0,
      excluded: { shown: 0, abandoned: 0, undone: 0, checkerWithheld: 0, unscored: 0 },
    };

    render(<QuestionAnalyticsSection analytics={analytics} />);

    expect(screen.getByText('Fixed · first presentation')).toBeInTheDocument();
    expect(screen.getByText('Generated · repeated variants')).toBeInTheDocument();
    expect(screen.getByText('Criterion 0')).toBeInTheDocument();
    expect(
      screen.queryByText('Create and practise Questions to see application evidence here.'),
    ).not.toBeInTheDocument();
  });

  it('renders every evidence cohort, raw marks, exclusions and all versioned criteria', () => {
    const analytics: QuestionAnalytics = {
      inventory: { total: 4, due: 1, unseen: 1, suspended: 1 },
      fixed: {
        definitionCount: 2,
        presentedDefinitionCount: 2,
        exposureCoverage: 1,
        firstPresentation: metric(1, 0, 1, 2),
        repeat: metric(1, 1, 1, 1),
      },
      generated: {
        definitionCount: 2,
        presentationCount: 3,
        uniqueVariantCount: 2,
        repeatedPresentationCount: 1,
        repeatRate: 1 / 3,
        novel: metric(1, 0, 1, 2),
        repeated: metric(1, 0, 0, 1),
      },
      criteria: [criterion(0), criterion(1), criterion(2), criterion(3)],
      checkerDisputeCount: 2,
      excluded: { shown: 1, abandoned: 2, undone: 3, checkerWithheld: 4, unscored: 5 },
    };

    render(<QuestionAnalyticsSection analytics={analytics} />);

    expect(screen.getByText('Generated · novel variants')).toBeInTheDocument();
    expect(screen.getByText('Generated · repeated variants')).toBeInTheDocument();
    expect(screen.getByText('Recorded marks')).toBeInTheDocument();
    expect(screen.getByText('3 / 6')).toBeInTheDocument();
    expect(screen.getByText('Excluded evidence')).toBeInTheDocument();
    expect(screen.getByText('Checker withheld')).toBeInTheDocument();
    expect(screen.getByText('Criterion 3')).toBeInTheDocument();
    expect(screen.getByText('question-3')).toBeInTheDocument();
  });
});
