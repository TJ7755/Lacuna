import type { CardType, MarkSchemeLine } from '../db/types';
import { CURRENT_ITEM_PAYLOAD_VERSION } from '../db/types';
import { compileMarkScheme, serialiseMarkScheme } from './markSchemeCompiler';
import { numericAnswerSpecIsValid } from './numericAnswerSpec';

const KNOWN_ITEM_KINDS = new Set(['numeric', 'working', 'scaffold']);
const PREDICATES = new Set(['equals', 'within', 'matches-one-of', 'contains']);

/** Return true for a record-like object without accepting arrays as records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate a compiled scheme's runtime shape and its expression semantics. */
function markSchemeIsValid(value: unknown): value is MarkSchemeLine[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (
    value.some((line) => {
      if (!isRecord(line)) return true;
      if (
        typeof line.marks !== 'number' ||
        !Number.isSafeInteger(line.marks) ||
        line.marks <= 0 ||
        (line.label !== undefined && typeof line.label !== 'string')
      ) {
        return true;
      }
      if (line.kind === 'waypoint') return typeof line.expression !== 'string';
      return !(
        line.kind === 'predicate' &&
        typeof line.predicate === 'string' &&
        PREDICATES.has(line.predicate) &&
        (line.args === undefined ||
          (Array.isArray(line.args) && line.args.every((arg) => typeof arg === 'string')))
      );
    })
  ) {
    return false;
  }

  try {
    const compiled = compileMarkScheme(serialiseMarkScheme(value as MarkSchemeLine[]));
    return (
      compiled.lines.length === value.length &&
      compiled.lines.every((line) => line.kind === 'compiled')
    );
  } catch {
    return false;
  }
}

function fixturesAreValid(value: unknown, maximumMarks?: number): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  return value.every((fixture) => {
    if (!isRecord(fixture)) return false;
    const answer = fixture.studentAnswer;
    const answerIsValid =
      typeof answer === 'string' ||
      (Array.isArray(answer) &&
        answer.length > 0 &&
        answer.every((line) => typeof line === 'string'));
    return (
      typeof fixture.id === 'string' &&
      answerIsValid &&
      typeof fixture.expectedMarks === 'number' &&
      Number.isSafeInteger(fixture.expectedMarks) &&
      fixture.expectedMarks >= 0 &&
      (maximumMarks === undefined || fixture.expectedMarks <= maximumMarks) &&
      (fixture.note === undefined || typeof fixture.note === 'string')
    );
  });
}

/**
 * Validate structured item data at a persistence boundary.
 *
 * Unknown versions and kinds are deliberately accepted: they must survive a round trip so
 * a newer client can import them, while the current client renders them read-only. Known v1
 * payloads, however, must be complete enough for the study verifier to consume safely.
 */
export function itemPayloadIsValid(payload: unknown): boolean {
  // Null is the legacy representation of an absent payload in older card rows.
  if (payload === undefined || payload === null) return true;
  if (!isRecord(payload)) return false;
  if (
    typeof payload.v !== 'number' ||
    !Number.isSafeInteger(payload.v) ||
    typeof payload.kind !== 'string'
  ) {
    return false;
  }

  if (payload.v !== CURRENT_ITEM_PAYLOAD_VERSION || !KNOWN_ITEM_KINDS.has(payload.kind)) {
    return true;
  }
  if (payload.kind === 'scaffold') return true;
  if (payload.kind === 'numeric') {
    return numericAnswerSpecIsValid(payload.answer) && fixturesAreValid(payload.fixtures, 1);
  }

  const scheme = payload.scheme;
  if (!markSchemeIsValid(scheme)) return false;
  const availableMarks = (scheme as MarkSchemeLine[]).reduce(
    (total, line) => total + line.marks,
    0,
  );
  return fixturesAreValid(payload.fixtures, availableMarks);
}

/** Throw a stable validation error rather than allowing malformed data into IndexedDB. */
export function assertValidItemPayload(payload: unknown): void {
  if (!itemPayloadIsValid(payload)) {
    throw new Error('Invalid structured item payload.');
  }
}

/** Validate both the payload and the card type that owns it. */
export function assertValidCardPayload(type: CardType, payload: unknown): void {
  if (payload === undefined || payload === null) return;
  if (type !== 'front_back') {
    throw new Error('Structured item payloads require a front_back card.');
  }
  assertValidItemPayload(payload);
}
