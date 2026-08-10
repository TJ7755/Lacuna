import type { NumericAnswerSpec } from '../db/types';
import { parseExpression } from './verify';

function expressionIsConstant(source: string): boolean {
  const parsed = parseExpression(source);
  return parsed.ok && parsed.expression.variables.length === 0;
}

/** Validate untrusted numeric-answer data before it reaches an item payload. */
export function numericAnswerSpecIsValid(spec: unknown): spec is NumericAnswerSpec {
  if (!spec || typeof spec !== 'object') return false;
  const candidate = spec as Record<string, unknown>;
  if (candidate.kind === 'matches-one-of') {
    return (
      Array.isArray(candidate.values) &&
      candidate.values.length > 0 &&
      candidate.values.every(
        (value): value is string => typeof value === 'string' && expressionIsConstant(value),
      )
    );
  }
  if (candidate.kind !== 'exact' && candidate.kind !== 'within') return false;
  if (typeof candidate.value !== 'string' || !expressionIsConstant(candidate.value)) return false;
  return (
    candidate.kind === 'exact' ||
    (typeof candidate.tolerance === 'number' &&
      Number.isFinite(candidate.tolerance) &&
      candidate.tolerance >= 0)
  );
}
