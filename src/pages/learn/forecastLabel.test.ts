import { describe, expect, it } from 'vitest';
import type { Course } from '../../db/types';
import { forecastLabel } from './LearnHeader';

const NOW = new Date(2026, 9, 5).getTime();
const unit = (overrides: Partial<Course>) => ({ examObjective: 'expectedMarks', ...overrides }) as Course;

describe('forecastLabel', () => {
  it('names the rolling horizon when there is no exam ahead', () => {
    expect(forecastLabel(unit({}), NOW)).toBe('forecast recall in 7 days');
    expect(forecastLabel(unit({ examDate: NOW - 1 }), NOW)).toBe('forecast recall in 7 days');
  });

  it('names the exam while one is ahead', () => {
    expect(forecastLabel(unit({ examDate: NOW + 1 }), NOW)).toBe('forecast recall at the exam');
  });

  it('keeps the secured and readiness wording', () => {
    expect(forecastLabel(unit({ examObjective: 'securedTopics' }), NOW)).toBe('secured');
    expect(forecastLabel(null, NOW)).toBe('predicted readiness');
  });
});
