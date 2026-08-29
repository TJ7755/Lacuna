import { describe, expect, it } from 'vitest';
import { INSTRUCTION_CONFORMANCE_FIXTURES } from './instructionConformance.fixture';
import { instructionConformance, routeTeachingRequest } from './instructionConformance';

describe('instruction-bundle conformance routing', () => {
  for (const fixture of INSTRUCTION_CONFORMANCE_FIXTURES) {
    it(fixture.name, () => {
      expect(routeTeachingRequest(fixture.input)).toBe(fixture.expectedRoute);
    });
  }

  it('keeps grounding, evidence, permission and Stop rules on every route', () => {
    for (const fixture of INSTRUCTION_CONFORMANCE_FIXTURES) {
      expect(instructionConformance(fixture.input)).toEqual({
        route: fixture.expectedRoute,
        stages: fixture.expectedStages,
        alwaysApplied: ['grounding', 'evidence', 'permissions', 'stop'],
      });
    }
  });
});
