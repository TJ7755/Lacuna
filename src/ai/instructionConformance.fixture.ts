import type { TeachingRouteInput, TeachingStage } from './instructionConformance';

export interface InstructionConformanceFixture {
  name: string;
  input: TeachingRouteInput;
  expectedRoute: 'operate' | 'answer-directly' | 'diagnose' | 'misconception-first';
  expectedStages: readonly TeachingStage[];
}

export const INSTRUCTION_CONFORMANCE_FIXTURES = [
  {
    name: 'operational request',
    input: {
      misconceptionFirstEnabled: true,
      requestKind: 'operational',
      directAnswerRequested: false,
      priorModelAvailable: true,
      relevantMisconceptionMemory: 'active',
    },
    expectedRoute: 'operate',
    expectedStages: ['operate'],
  },
  {
    name: 'explicit direct answer',
    input: {
      misconceptionFirstEnabled: true,
      requestKind: 'conceptual',
      directAnswerRequested: true,
      priorModelAvailable: true,
      relevantMisconceptionMemory: 'active',
    },
    expectedRoute: 'answer-directly',
    expectedStages: ['search-memory', 'answer'],
  },
  {
    name: 'completely novel concept',
    input: {
      misconceptionFirstEnabled: true,
      requestKind: 'conceptual',
      directAnswerRequested: false,
      priorModelAvailable: false,
      relevantMisconceptionMemory: 'none',
    },
    expectedRoute: 'answer-directly',
    expectedStages: ['search-memory', 'answer'],
  },
  {
    name: 'conceptual request without an established misconception',
    input: {
      misconceptionFirstEnabled: true,
      requestKind: 'conceptual',
      directAnswerRequested: false,
      priorModelAvailable: true,
      relevantMisconceptionMemory: 'none',
    },
    expectedRoute: 'diagnose',
    expectedStages: ['search-memory', 'diagnose'],
  },
  {
    name: 'known active misconception',
    input: {
      misconceptionFirstEnabled: true,
      requestKind: 'conceptual',
      directAnswerRequested: false,
      priorModelAvailable: true,
      relevantMisconceptionMemory: 'active',
    },
    expectedRoute: 'misconception-first',
    expectedStages: [
      'search-memory',
      'surface-model',
      'conflict',
      'resolve',
      'transfer',
      'update-evidence',
    ],
  },
  {
    name: 'known uncertain misconception',
    input: {
      misconceptionFirstEnabled: true,
      requestKind: 'conceptual',
      directAnswerRequested: false,
      priorModelAvailable: true,
      relevantMisconceptionMemory: 'uncertain',
    },
    expectedRoute: 'misconception-first',
    expectedStages: [
      'search-memory',
      'surface-model',
      'conflict',
      'resolve',
      'transfer',
      'update-evidence',
    ],
  },
  {
    name: 'resolved misconception is not silently resurrected',
    input: {
      misconceptionFirstEnabled: true,
      requestKind: 'conceptual',
      directAnswerRequested: false,
      priorModelAvailable: true,
      relevantMisconceptionMemory: 'resolved',
    },
    expectedRoute: 'diagnose',
    expectedStages: ['search-memory', 'diagnose'],
  },
  {
    name: 'disabled misconception-first setting',
    input: {
      misconceptionFirstEnabled: false,
      requestKind: 'conceptual',
      directAnswerRequested: false,
      priorModelAvailable: true,
      relevantMisconceptionMemory: 'active',
    },
    expectedRoute: 'answer-directly',
    expectedStages: ['search-memory', 'answer'],
  },
] as const satisfies readonly InstructionConformanceFixture[];
