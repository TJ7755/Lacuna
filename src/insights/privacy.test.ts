import { describe, expect, it } from 'vitest';
import {
  BAND_LOWER_BOUNDS,
  EXACT_DEVICE_COUNT_MINIMUM,
  SUPPRESSION_THRESHOLD,
  bandForRate,
  insightCell,
  presentDeviceCount,
} from './privacy';

// Owner-authored privacy rules for class insights (issue #588): suppression below K
// contributing devices, coarse bands instead of rates, and a count presentation that
// resists differencing. Scope note (owner decision, 2026-10-18): these rules now bind
// only readers without the course owner's key (plan #600); per-pupil content travels
// end-to-end encrypted and is not coarsened. The provisional proposal (K = 5, bands at
// 0.8 and 0.5) is pinned here so a later change to any of them is a conscious,
// reviewable decision.

describe('class insight privacy constants', () => {
  it('pins the proposed trial constants as provisional', () => {
    expect(SUPPRESSION_THRESHOLD).toBe(5);
    expect(EXACT_DEVICE_COUNT_MINIMUM).toBe(25);
    expect(BAND_LOWER_BOUNDS).toEqual({ secure: 0.8, developing: 0.5 });
  });
});

describe('suppression', () => {
  it.each([0, 1, 2, 3, SUPPRESSION_THRESHOLD - 1])(
    'suppresses a cell with %i contributing devices without publishing any number',
    (contributors) => {
      expect(insightCell({ contributors, numerator: 4, denominator: 5 })).toEqual({
        kind: 'suppressed',
      });
    },
  );

  it.each([
    { contributors: SUPPRESSION_THRESHOLD, presented: { kind: 'about', value: 5 } },
    { contributors: SUPPRESSION_THRESHOLD + 1, presented: { kind: 'about', value: 5 } },
    { contributors: SUPPRESSION_THRESHOLD * 2, presented: { kind: 'about', value: 10 } },
  ])(
    'publishes a coarse band rather than a rate for $contributors contributing devices',
    ({ contributors, presented }) => {
      expect(insightCell({ contributors, numerator: 4, denominator: 5 })).toEqual({
        kind: 'band',
        band: 'secure',
        contributors: presented,
      });
    },
  );

  it.each([
    { contributors: Number.NaN, numerator: 4, denominator: 5 },
    { contributors: -1, numerator: 4, denominator: 5 },
    { contributors: 6.5, numerator: 4, denominator: 5 },
    { contributors: 6, numerator: -1, denominator: 5 },
    { contributors: 6, numerator: 4.5, denominator: 5 },
    { contributors: 6, numerator: 6, denominator: 5 },
    { contributors: 6, numerator: Number.NaN, denominator: 5 },
    { contributors: 6, numerator: 4, denominator: 0 },
  ])('suppresses impossible aggregates rather than throwing: %j', (input) => {
    expect(insightCell(input)).toEqual({ kind: 'suppressed' });
  });
});

describe('banding', () => {
  it.each([
    { numerator: 0, denominator: 5, band: 'weak' },
    { numerator: 2, denominator: 5, band: 'weak' },
    { numerator: 499, denominator: 1000, band: 'weak' },
    { numerator: 1, denominator: 2, band: 'developing' },
    { numerator: 7, denominator: 10, band: 'developing' },
    { numerator: 799, denominator: 1000, band: 'developing' },
    { numerator: 4, denominator: 5, band: 'secure' },
    { numerator: 5, denominator: 5, band: 'secure' },
  ])(
    'classifies a rate of $numerator/$denominator ($band) for a visible cell',
    ({ numerator, denominator, band }) => {
      expect(bandForRate(numerator / denominator)).toBe(band);
      expect(insightCell({ contributors: SUPPRESSION_THRESHOLD, numerator, denominator })).toEqual({
        kind: 'band',
        band,
        contributors: { kind: 'about', value: 5 },
      });
    },
  );
});

describe('device count presentation', () => {
  it.each([
    { count: 0, presented: { kind: 'fewer', limit: SUPPRESSION_THRESHOLD } },
    { count: 4, presented: { kind: 'fewer', limit: SUPPRESSION_THRESHOLD } },
    { count: 5, presented: { kind: 'about', value: 5 } },
    { count: 6, presented: { kind: 'about', value: 5 } },
    { count: 9, presented: { kind: 'about', value: 10 } },
    { count: 10, presented: { kind: 'about', value: 10 } },
    { count: 12, presented: { kind: 'about', value: 10 } },
    { count: 13, presented: { kind: 'about', value: 15 } },
    { count: 14, presented: { kind: 'about', value: 15 } },
    { count: 24, presented: { kind: 'about', value: 25 } },
    { count: 25, presented: { kind: 'exact', value: 25 } },
    { count: 26, presented: { kind: 'exact', value: 26 } },
    { count: 30, presented: { kind: 'exact', value: 30 } },
  ])('presents %i active devices as %j', ({ count, presented }) => {
    expect(presentDeviceCount(count)).toEqual(presented);
  });

  it.each([{ count: Number.NaN }, { count: -1 }, { count: 6.5 }])(
    'presents a malformed count as a grouped lower band: %j',
    ({ count }) => {
      expect(presentDeviceCount(count)).toEqual({
        kind: 'fewer',
        limit: SUPPRESSION_THRESHOLD,
      });
    },
  );
});

describe('differencing across weeks and overlapping cells', () => {
  it('cannot expose a rate when a single device stops contributing above the threshold', () => {
    // Week one: six devices answer 5 of 6 marks correctly. Week two: the teacher knows
    // one pupil was absent, so five devices answer 4 of 5. Both weeks stay visible but
    // publish the same coarse cell - after rounding, the one-device change is entirely
    // invisible, so subtracting the weeks yields no information at all. Where an
    // absence shifts the underlying rate across a band boundary, a different band may
    // still be published, but never an exact rate or count.
    const before = insightCell({ contributors: 6, numerator: 5, denominator: 6 });
    const after = insightCell({ contributors: 5, numerator: 4, denominator: 5 });
    expect(before).toEqual({
      kind: 'band',
      band: 'secure',
      contributors: { kind: 'about', value: 5 },
    });
    expect(after).toEqual(before);
  });

  it('suppresses the week where a pupil absence drops the cohort below the threshold', () => {
    // Before: six devices. After: four remain, so the aggregate is dark and the absent
    // pupil's result is unrecoverable by subtraction.
    expect(insightCell({ contributors: 4, numerator: 3, denominator: 4 })).toEqual({
      kind: 'suppressed',
    });
  });

  it('cannot be differenced across overlapping cells of the same cohort', () => {
    // The same six devices contribute to a Concept cell (marks across attempts) and to
    // one of its mark-scheme criteria (full-credit opportunities). Knowing one band
    // reveals nothing exact about the other; the two bands are also not subtractable
    // because their denominators differ (10 marks against 6 opportunities).
    const conceptCell = insightCell({ contributors: 6, numerator: 9, denominator: 10 });
    const criterionCell = insightCell({ contributors: 6, numerator: 3, denominator: 6 });
    expect(conceptCell).toEqual({
      kind: 'band',
      band: 'secure',
      contributors: { kind: 'about', value: 5 },
    });
    expect(criterionCell).toEqual({
      kind: 'band',
      band: 'developing',
      contributors: { kind: 'about', value: 5 },
    });
  });

  it('rounds counts so single-device participation changes are not published', () => {
    expect(presentDeviceCount(13)).toEqual(presentDeviceCount(14));
    expect(presentDeviceCount(6)).toEqual(presentDeviceCount(7));
  });
});
