import { describe, expect, it } from 'vitest';
import { lessonTickLabel } from './SeriesCards';

describe('lessonTickLabel', () => {
  it('keeps a short lesson name whole', () => {
    expect(lessonTickLabel('Cells')).toBe('Cells');
  });

  it('cuts a long lesson name to fit the slanted axis, ending in an ellipsis', () => {
    const label = lessonTickLabel('Data, sharing & advanced features');
    expect(label).toBe('Data, sharing & advan…');
    expect(label.length).toBeLessThanOrEqual(22);
  });
});
