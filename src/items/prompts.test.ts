import { describe, expect, it } from 'vitest';
import {
  BATCH_OUTPUT_END,
  BATCH_OUTPUT_START,
  MAX_BATCH_ITEMS,
  buildBatchGenerationPrompt,
  buildMarkSchemeDraftPrompt,
} from './prompts';
import {
  MARK_SCHEME_PREDICATES,
  MARK_SCHEME_SYNTAX_EXAMPLES,
  compileMarkScheme,
  markSchemeSyntaxSpecification,
} from './markSchemeCompiler';

describe('mark-scheme authoring prompt', () => {
  it('contains the question and compiler-owned grammar specification', () => {
    const prompt = buildMarkSchemeDraftPrompt('Solve 2x = 8.');

    expect(prompt).toContain('Solve 2x = 8.');
    expect(prompt).toContain(markSchemeSyntaxSpecification());
    for (const predicate of MARK_SCHEME_PREDICATES) expect(prompt).toContain(predicate);
  });

  it('keeps every canonical prompt example accepted by the compiler', () => {
    for (const example of MARK_SCHEME_SYNTAX_EXAMPLES) {
      expect(compileMarkScheme(example).lines[0]?.kind).toBe('compiled');
    }
  });
});

describe('batch authoring prompt', () => {
  it('includes inputs, clarification discipline and the delimited output shape', () => {
    const prompt = buildBatchGenerationPrompt({
      notes: 'Price rises reduce quantity demanded.',
      topic: 'Demand',
      level: 'A level',
      itemCount: 8,
    });

    expect(prompt).toContain('Price rises reduce quantity demanded.');
    expect(prompt).toContain('Topic: Demand');
    expect(prompt).toContain('Level: A level');
    expect(prompt).toContain('no more than three');
    expect(prompt).toContain(BATCH_OUTPUT_START);
    expect(prompt).toContain(BATCH_OUTPUT_END);
    expect(prompt).toContain('"fixtures"');
  });

  it('caps each response and supports explicit continuation rounds', () => {
    const prompt = buildBatchGenerationPrompt({
      notes: 'Notes',
      topic: 'Topic',
      level: 'Level',
      itemCount: 500,
      round: 3,
    });

    expect(prompt).toContain(`Requested items: ${MAX_BATCH_ITEMS}`);
    expect(prompt).toContain(`continuation round 3`);
    expect(prompt).toContain(`next ${MAX_BATCH_ITEMS} items`);
  });
});
