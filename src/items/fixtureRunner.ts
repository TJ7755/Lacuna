import type { ItemFixture, MarkSchemeLine } from '../db/types';
import { verifyWorkingLines } from './verify';

export interface FixtureRunResult {
  fixture: ItemFixture;
  marksEarned: number;
  passes: boolean;
}

/** Run pinned working fixtures through the same verifier used by study and authoring. */
export function runWorkingFixtures(
  scheme: MarkSchemeLine[],
  fixtures: ItemFixture[],
): FixtureRunResult[] {
  return fixtures.map((fixture) => {
    const lines = Array.isArray(fixture.studentAnswer)
      ? fixture.studentAnswer
      : fixture.studentAnswer
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
    const result = verifyWorkingLines(lines, scheme, fixture.id);
    return {
      fixture,
      marksEarned: result.marksEarned,
      passes: result.marksEarned === fixture.expectedMarks,
    };
  });
}
