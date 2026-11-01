import type { JevDecisionResult } from '../../apps/web/src/jev/protocol';
import { JEV_DIAGNOSTIC_CATEGORIES, JEV_DIAGNOSTIC_OUTCOMES } from '@lacuna/core/jev/diagnosis';
import type { Label } from './labels';
import { cases, policy, strata } from './pack';

export type Observation = {
  id: string;
  status:
    | 'ok'
    | 'timeout'
    | 'http-error'
    | 'invalid-response'
    | 'network-error'
    | 'in-flight'
    | 'not-run';
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  httpStatus: number | null;
  result?: Omit<JevDecisionResult, 'inputTokens'>;
};

export function proportion(count: number, total: number) {
  if (!total) return { count, total, rate: null, lower95: null, upper95: null };
  const rate = count / total;
  const z2 = 1.96 ** 2;
  const centre = (rate + z2 / (2 * total)) / (1 + z2 / total);
  const radius =
    (1.96 * Math.sqrt((rate * (1 - rate)) / total + z2 / (4 * total ** 2))) / (1 + z2 / total);
  return {
    count,
    total,
    rate,
    lower95: Math.max(0, centre - radius),
    upper95: Math.min(1, centre + radius),
  };
}

export function summarise(gold: Label[], observations: Observation[], evaluationCases = cases) {
  if (
    gold.length !== evaluationCases.length ||
    observations.length !== evaluationCases.length ||
    new Set(gold.map((row) => row.id)).size !== evaluationCases.length ||
    new Set(observations.map((row) => row.id)).size !== evaluationCases.length
  )
    throw new Error('Metrics require exactly one label and observation per case.');
  const rows = evaluationCases.map((item) => {
    const label = gold.find((row) => row.id === item.id);
    const observation = observations.find((row) => row.id === item.id);
    if (!label || !observation) throw new Error('Metrics case identity mismatch.');
    return { ...item, label, ...observation };
  });
  const metrics = (subset: typeof rows) => {
    const decided = subset.filter(
      (row) => row.status === 'ok' && row.result?.value !== null && row.result?.value !== undefined,
    );
    const over = decided.filter((row) => row.result!.value! > row.label.mark);
    const under = decided.filter((row) => row.result!.value! < row.label.mark);
    const categories = Object.fromEntries(
      JEV_DIAGNOSTIC_CATEGORIES.map((category) => {
        const prediction = (row: (typeof rows)[number]) =>
          row.status === 'ok'
            ? row.result?.diagnosis?.decisions.find((decision) => decision.categoryId === category)
                ?.outcome
            : undefined;
        return [
          category,
          {
            abstention: proportion(
              subset.filter((row) => prediction(row) === 'insufficient-evidence').length,
              subset.length,
            ),
            confidentErrors: proportion(
              subset.filter((row) => {
                const outcome = prediction(row);
                return (
                  outcome !== undefined &&
                  outcome !== 'insufficient-evidence' &&
                  outcome !== row.label[category]
                );
              }).length,
              subset.length,
            ),
            outcomes: Object.fromEntries(
              JEV_DIAGNOSTIC_OUTCOMES.map((outcome) => {
                const expected = subset.filter((row) => row.label[category] === outcome);
                const predicted = subset.filter((row) => prediction(row) === outcome);
                const correct = predicted.filter((row) => row.label[category] === outcome).length;
                return [
                  outcome,
                  {
                    precision: proportion(correct, predicted.length),
                    recall: proportion(correct, expected.length),
                  },
                ];
              }),
            ),
          },
        ];
      }),
    );
    return {
      count: subset.length,
      distinctQuestions: new Set(subset.map((row) => row.questionId)).size,
      decided: decided.length,
      markAgreement: proportion(decided.length - over.length - under.length, decided.length),
      confidentErrors: proportion(over.length + under.length, decided.length),
      overmarks: proportion(over.length, decided.length),
      undermarks: proportion(under.length, decided.length),
      errorsExceedingOneMark: proportion(
        decided.filter((row) => Math.abs(row.result!.value! - row.label.mark) > 1).length,
        decided.filter((row) => row.request.maxMarks > 1).length,
      ),
      abstention: proportion(
        subset.filter((row) => row.status === 'ok' && row.result?.value === null).length,
        subset.length,
      ),
      unavailable: proportion(subset.filter((row) => row.status !== 'ok').length, subset.length),
      categories,
      mixedReferenceGaps: subset.filter(
        (row) =>
          JEV_DIAGNOSTIC_CATEGORIES.filter((category) => row.label[category] === 'gap').length > 1,
      ).length,
      fullMarkReferenceAnswers: subset.filter((row) => row.label.mark === row.request.maxMarks)
        .length,
    };
  };
  const byAnswerType = Object.fromEntries(
    ['short-answer', 'multi-mark'].map((type) => {
      const subset = rows.filter((row) => row.answerType === type);
      const result = metrics(subset);
      const categoryCoverage = JEV_DIAGNOSTIC_CATEGORIES.every((category) => {
        const positives = subset.filter((row) => row.label[category] === 'gap').length;
        return (
          positives >= policy.minimumPositiveAndNegativePerCategory &&
          subset.length - positives >= policy.minimumPositiveAndNegativePerCategory
        );
      });
      const enough =
        result.count >= policy.minimumCasesPerAnswerType &&
        result.distinctQuestions >= policy.minimumQuestionsPerAnswerType &&
        categoryCoverage;
      const meets =
        (result.markAgreement.lower95 ?? 0) >= policy.minimumMarkAgreementLower95 &&
        (result.confidentErrors.upper95 ?? 1) <= policy.maximumConfidentErrorUpper95 &&
        (result.abstention.upper95 ?? 1) <= policy.maximumAbstentionUpper95 &&
        (result.abstention.rate ?? 1) <= policy.maximumObservedAbstention &&
        result.unavailable.count === 0 &&
        Object.values(result.categories).every((category) =>
          Object.values(category.outcomes).every(
            (outcome) =>
              (outcome.precision.lower95 ?? 0) >= policy.minimumCategoryPrecisionRecallLower95 &&
              (outcome.recall.lower95 ?? 0) >= policy.minimumCategoryPrecisionRecallLower95,
          ),
        );
      return [
        type,
        {
          ...result,
          decision: !enough
            ? 'undersampled'
            : meets
              ? 'candidate-for-independent-review'
              : 'fails-predefined-criteria',
        },
      ];
    }),
  );
  const latencies = rows
    .flatMap((row) => (row.latencyMs === null ? [] : [row.latencyMs]))
    .sort((a, b) => a - b);
  const failures = rows.flatMap((row) => {
    const reasons: string[] = [];
    if (row.status !== 'ok') reasons.push(row.status);
    else {
      if (row.result?.value === null) reasons.push('mark-abstention');
      else if (row.result?.value !== row.label.mark) reasons.push('mark-disagreement');
      for (const category of JEV_DIAGNOSTIC_CATEGORIES) {
        if (
          row.result?.diagnosis?.decisions.find((entry) => entry.categoryId === category)
            ?.outcome !== row.label[category]
        )
          reasons.push(`${category}-disagreement`);
      }
    }
    return reasons.length
      ? [
          {
            id: row.id,
            questionId: row.questionId,
            answerType: row.answerType,
            stratum: row.stratum,
            request: row.request,
            reasons,
            expected: row.label,
            observed: row.result ?? null,
          },
        ]
      : [];
  });
  return {
    overall: metrics(rows),
    byAnswerType,
    byStratum: Object.fromEntries(
      strata.map((stratum) => [stratum, metrics(rows.filter((row) => row.stratum === stratum))]),
    ),
    unsupported: policy.unsupported,
    failures,
    telemetry: {
      attempted: rows.filter((row) => row.status !== 'not-run').length,
      timeouts: rows.filter((row) => row.status === 'timeout').length,
      knownInputTokens: rows.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
      unknownInputTokenRequests: rows.filter(
        (row) => row.status !== 'not-run' && row.inputTokens === null,
      ).length,
      knownOutputTokens: rows.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0),
      latencyMs: {
        count: latencies.length,
        p50: latencies[Math.ceil(latencies.length * 0.5) - 1] ?? null,
        p95: latencies[Math.ceil(latencies.length * 0.95) - 1] ?? null,
        maximum: latencies.at(-1) ?? null,
      },
      cache: 'No local cache; fetch cache=no-store. Upstream cache behaviour unknown.',
      cost: null,
      costAssumption:
        'No pricing configured; token counts are not a currency estimate. #909 owns a reviewed cost model.',
    },
    manualOverride:
      'Not exercised by this direct-provider harness. Original provider results are immutable evidence; manual marks cannot validate diagnosis. Pupil-flow verification remains separate.',
    accessDecision: 'Keep #905 open; no hosted access change is authorised by this report.',
  };
}
