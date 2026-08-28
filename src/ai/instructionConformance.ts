export type TeachingRoute = 'operate' | 'answer-directly' | 'diagnose' | 'misconception-first';
export type TeachingStage =
  | 'operate'
  | 'search-memory'
  | 'answer'
  | 'diagnose'
  | 'surface-model'
  | 'conflict'
  | 'resolve'
  | 'transfer'
  | 'update-evidence';

export interface TeachingRouteInput {
  misconceptionFirstEnabled: boolean;
  requestKind: 'operational' | 'conceptual';
  directAnswerRequested: boolean;
  priorModelAvailable: boolean;
  relevantMisconceptionMemory: 'none' | 'active' | 'uncertain' | 'resolved';
}

export const ALWAYS_APPLIED_INSTRUCTION_RULES = [
  'grounding',
  'evidence',
  'permissions',
  'stop',
] as const;

export interface InstructionConformanceDecision {
  route: TeachingRoute;
  stages: readonly TeachingStage[];
  alwaysApplied: typeof ALWAYS_APPLIED_INSTRUCTION_RULES;
}

/**
 * Deterministic model of the route encoded in the instruction bundle. This is a conformance
 * fixture seam, not a brittle attempt to classify arbitrary prose in application code.
 */
export function routeTeachingRequest(input: TeachingRouteInput): TeachingRoute {
  if (input.requestKind === 'operational') return 'operate';
  if (
    !input.misconceptionFirstEnabled ||
    input.directAnswerRequested ||
    !input.priorModelAvailable
  ) {
    return 'answer-directly';
  }
  if (
    input.relevantMisconceptionMemory === 'active' ||
    input.relevantMisconceptionMemory === 'uncertain'
  ) {
    return 'misconception-first';
  }
  return 'diagnose';
}

export function instructionConformance(input: TeachingRouteInput): InstructionConformanceDecision {
  const route = routeTeachingRequest(input);
  const stages: readonly TeachingStage[] =
    route === 'operate'
      ? ['operate']
      : route === 'answer-directly'
        ? ['search-memory', 'answer']
        : route === 'diagnose'
          ? ['search-memory', 'diagnose']
          : [
              'search-memory',
              'surface-model',
              'conflict',
              'resolve',
              'transfer',
              'update-evidence',
            ];
  return { route, stages, alwaysApplied: ALWAYS_APPLIED_INSTRUCTION_RULES };
}
