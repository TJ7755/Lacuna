import type { UserPerformance } from '../db/types';
import { DEFAULT_REVIEW_SECONDS } from './stats';

export interface ResponseTimeCoefficients {
  fallbackSeconds: number;
  fallbackStandardDeviationSeconds: number;
  priorCorrectReviews: number;
  minimumSeconds: number;
  maximumSeconds: number;
  failureFeedbackSeconds: number;
}

/**
 * Conservative cost prior. Eight seconds is the existing workload fallback; twenty correct
 * reviews matches grading calibration, and failure feedback is costed separately.
 */
export const DEFAULT_RESPONSE_TIME_COEFFICIENTS: ResponseTimeCoefficients = {
  fallbackSeconds: DEFAULT_REVIEW_SECONDS,
  fallbackStandardDeviationSeconds: 4,
  priorCorrectReviews: 20,
  minimumSeconds: 0.5,
  maximumSeconds: 120,
  failureFeedbackSeconds: 4,
};

export interface ResponseTimeEstimate {
  expectedSeconds: number;
  standardDeviationSeconds: number;
  personalisedWeight: number;
}

export function validResponseTimeCoefficients(value: ResponseTimeCoefficients): boolean {
  return (
    Number.isFinite(value.fallbackSeconds) &&
    value.fallbackSeconds > 0 &&
    Number.isFinite(value.fallbackStandardDeviationSeconds) &&
    value.fallbackStandardDeviationSeconds >= 0 &&
    Number.isFinite(value.priorCorrectReviews) &&
    value.priorCorrectReviews > 0 &&
    Number.isFinite(value.minimumSeconds) &&
    value.minimumSeconds > 0 &&
    Number.isFinite(value.maximumSeconds) &&
    value.maximumSeconds >= value.minimumSeconds &&
    value.fallbackSeconds >= value.minimumSeconds &&
    value.fallbackSeconds <= value.maximumSeconds &&
    Number.isFinite(value.failureFeedbackSeconds) &&
    value.failureFeedbackSeconds >= 0
  );
}

export function estimateResponseTime(
  performance: UserPerformance | undefined,
  coefficients: ResponseTimeCoefficients = DEFAULT_RESPONSE_TIME_COEFFICIENTS,
): ResponseTimeEstimate {
  if (!validResponseTimeCoefficients(coefficients)) {
    throw new Error('Response-time coefficients are corrupt.');
  }
  const usable =
    performance &&
    Number.isInteger(performance.totalCorrectReviews) &&
    performance.totalCorrectReviews > 0 &&
    Number.isFinite(performance.runningMeanResponseTime) &&
    performance.runningMeanResponseTime > 0 &&
    Number.isFinite(performance.runningStdDevResponseTime) &&
    performance.runningStdDevResponseTime >= 0;
  if (!usable) {
    return {
      expectedSeconds: coefficients.fallbackSeconds,
      standardDeviationSeconds: coefficients.fallbackStandardDeviationSeconds,
      personalisedWeight: 0,
    };
  }

  const count = performance.totalCorrectReviews;
  const weight = count / (count + coefficients.priorCorrectReviews);
  const personalMean = Math.min(
    coefficients.maximumSeconds,
    Math.max(coefficients.minimumSeconds, performance.runningMeanResponseTime),
  );
  const personalDeviation = Math.min(
    coefficients.maximumSeconds,
    performance.runningStdDevResponseTime,
  );
  return {
    expectedSeconds: coefficients.fallbackSeconds * (1 - weight) + personalMean * weight,
    standardDeviationSeconds: Math.sqrt(
      (1 - weight) * coefficients.fallbackStandardDeviationSeconds ** 2 +
        weight * personalDeviation ** 2,
    ),
    personalisedWeight: weight,
  };
}
