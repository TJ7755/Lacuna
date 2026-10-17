import { makeId } from '../utils/id';
import type { MarkAllocation } from './questionSets';

/** Non-blank lines are points; a trailing integer in brackets is stored only in maxMarks. */
export function parseMarkSchemeLines(
  source: string,
  previous: readonly MarkAllocation[] = [],
): MarkAllocation[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const weight = line.match(/\s*\((\d+)\)\s*$/);
      return {
        ...previous[index],
        id: previous[index]?.id ?? makeId(),
        criterion: weight ? line.slice(0, weight.index).trimEnd() : line,
        maxMarks: weight ? Number(weight[1]) : 1,
        dimension: previous[index]?.dimension ?? 'knowledge',
        targetConceptIds: previous[index]?.targetConceptIds ?? [],
      };
    });
}

export function formatMarkSchemeLines(points: readonly MarkAllocation[]): string {
  return points
    .map(
      (point) =>
        `${point.criterion}${point.maxMarks === 1 && !/\(\d+\)\s*$/.test(point.criterion) ? '' : ` (${point.maxMarks})`}`,
    )
    .join('\n');
}
