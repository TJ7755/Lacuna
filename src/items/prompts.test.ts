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
    });

    expect(prompt).toContain('Price rises reduce quantity demanded.');
    expect(prompt).toContain('Topic: Demand');
    expect(prompt).toContain('Level: A level');
    expect(prompt).toContain('no more than three');
    expect(prompt).toContain(BATCH_OUTPUT_START);
    expect(prompt).toContain(BATCH_OUTPUT_END);
    expect(prompt).toContain('"fixtures"');
  });

  it('caps a requested maximum and injects a concept-density constraint', () => {
    const prompt = buildBatchGenerationPrompt({
      notes: 'Notes',
      topic: 'Topic',
      level: 'Level',
      maxItems: 500,
      conceptsPerItem: 2,
    });

    expect(prompt).toContain(`Requested maximum items: ${MAX_BATCH_ITEMS}`);
    expect(prompt).toContain('Target concept density: 2 atomic concepts per item');
  });

  it('lets the model choose both constraints within the hard cap', () => {
    const prompt = buildBatchGenerationPrompt({
      notes: 'Dense notes',
      topic: 'Topic',
      level: 'Level',
    });

    expect(prompt).toContain('Concepts per item: model-selected');
    expect(prompt).toContain('Requested maximum items: model-selected');
    expect(prompt).toContain(`Never return more than ${MAX_BATCH_ITEMS} items`);
  });
});
