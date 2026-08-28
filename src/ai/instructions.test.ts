import { describe, expect, it } from 'vitest';
import { aiInstructionBundleSchema } from './protocol';
import { AI_TEACHING_INSTRUCTION_VERSION, buildAiInstructionBundle } from './instructions';

describe('buildAiInstructionBundle', () => {
  it('builds a strict, versioned bundle with unconditional trust rules', () => {
    const bundle = buildAiInstructionBundle({ misconceptionFirstEnabled: false });

    expect(aiInstructionBundleSchema.parse(bundle)).toEqual(bundle);
    expect(bundle.instructionVersion).toBe(AI_TEACHING_INSTRUCTION_VERSION);
    expect(bundle.content).toContain('Grounding and evidence');
    expect(bundle.content).toContain('Permissions and tool calls');
    expect(bundle.content).toContain('Stop');
    expect(bundle.content).toContain('Never fabricate a Card review or Question Attempt');
  });

  it('enables misconception-first teaching without applying it to every request', () => {
    const bundle = buildAiInstructionBundle({ misconceptionFirstEnabled: true });

    expect(bundle.misconceptionFirstEnabled).toBe(true);
    expect(bundle.content).toContain('Misconception-first teaching is enabled');
    expect(bundle.content).toContain(
      'Operational request: perform the requested operation directly.',
    );
    expect(bundle.content).toContain('Explicit direct-answer request: answer directly.');
    expect(bundle.content).toContain('Completely novel conceptual material');
    expect(bundle.content).toContain('Relevant active or uncertain misconception memory');
  });

  it('states that misconception-first teaching is disabled when the setting is off', () => {
    expect(buildAiInstructionBundle({ misconceptionFirstEnabled: false }).content).toContain(
      'Misconception-first teaching is disabled',
    );
  });
});
