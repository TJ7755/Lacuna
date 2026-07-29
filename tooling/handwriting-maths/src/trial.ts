/** The input-preference harness: three arms, identical targets, measured entry.
 *
 *  This is the half of A.2 that survives a poor recognition result, and the half Arc 11
 *  §11.3 actually needs, so it is deliberately independent of the recogniser. The canvas
 *  arm does not parse what was drawn — stroke grouping and layout parsing are not built
 *  — it records the ink and asks the participant whether they wrote the target. Ink is
 *  retained so trials can be scored properly once recognition exists, rather than the
 *  session having to be re-run.
 *
 *  Pure module: no DOM, no timers of its own. The UI supplies timestamps.
 */

import type { Point } from './strokes';

export type Arm = 'canvas' | 'keyboard' | 'palette';

export const ARMS: readonly Arm[] = ['canvas', 'keyboard', 'palette'];

export const ARM_LABELS: Record<Arm, string> = {
  canvas: 'Write it',
  keyboard: 'Type it',
  palette: 'Buttons',
};

/** One planned trial, before it is attempted. */
export interface PlannedTrial {
  arm: Arm;
  target: string;
}

/** One completed trial. */
export interface Trial extends PlannedTrial {
  /** Milliseconds from the target appearing to the participant declaring it finished. */
  durationMs: number;
  /** Whether the entry matched the target: exact string comparison for the keyboard and
   *  palette arms, self-reported for canvas. */
  correct: boolean;
  /** Deletions, clears and undos. A proxy for friction that duration alone misses: a
   *  fast entry riddled with corrections is not a comfortable one. */
  corrections: number;
  /** What was entered. Empty for the canvas arm, which has no parser. */
  entered: string;
  /** Raw ink, retained for canvas trials only so they can be re-scored later. */
  ink?: Point[];
}

/** Build a balanced, randomised trial order.
 *
 *  Every target is attempted once per arm. Ordering matters because of learning and
 *  fatigue effects: if the canvas arm always came last, it would look artificially good
 *  on a familiar target and artificially bad on a tired participant. Arms are therefore
 *  rotated per target (a Latin square, so each arm occupies each position equally often
 *  across the session) and the targets themselves are shuffled.
 *
 *  `random` is injectable so the ordering is testable. */
export const buildTrialOrder = (
  targets: readonly string[],
  random: () => number = Math.random,
): PlannedTrial[] => {
  const shuffled = targets.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.flatMap((target, index) =>
    ARMS.map((_, position) => ({
      // Rotate the starting arm by target index so no arm is systematically first.
      arm: ARMS[(position + index) % ARMS.length],
      target,
    })),
  );
};

/** Median rather than mean: n is tiny by design, and one fumbled trial should not
 *  dominate an arm's headline figure. */
export const median = (values: readonly number[]): number => {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

export interface ArmSummary {
  arm: Arm;
  trials: number;
  /** Median duration across *correct* trials only. Timing an entry the participant got
   *  wrong measures how fast they failed, which is not the question. */
  medianMs: number;
  accuracy: number;
  medianCorrections: number;
}

export const summariseArm = (arm: Arm, trials: readonly Trial[]): ArmSummary => {
  const forArm = trials.filter((trial) => trial.arm === arm);
  const correct = forArm.filter((trial) => trial.correct);
  return {
    arm,
    trials: forArm.length,
    medianMs: median(correct.map((trial) => trial.durationMs)),
    accuracy: forArm.length === 0 ? NaN : correct.length / forArm.length,
    medianCorrections: median(forArm.map((trial) => trial.corrections)),
  };
};

export const summarise = (trials: readonly Trial[]): ArmSummary[] =>
  ARMS.map((arm) => summariseArm(arm, trials));

/** Flatten a session to CSV for the report. Ink is omitted; it belongs in the JSON
 *  export, not in a column. */
export const toCsv = (trials: readonly Trial[]): string => {
  const header = 'arm,target,entered,correct,duration_ms,corrections';
  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const rows = trials.map((trial) =>
    [
      trial.arm,
      escape(trial.target),
      escape(trial.entered),
      trial.correct ? '1' : '0',
      String(Math.round(trial.durationMs)),
      String(trial.corrections),
    ].join(','),
  );
  return [header, ...rows].join('\n');
};
