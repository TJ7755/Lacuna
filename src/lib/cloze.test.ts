import { describe, it, expect } from 'vitest';
import {
  parseCloze,
  parseClozeTokens,
  getClozeIndices,
  isValidCloze,
  renderClozeFront,
  renderClozeBack,
  validateCloze,
  renderClozeRevealed,
} from './cloze';

// ---------------------------------------------------------------------------
// parseClozeTokens
// ---------------------------------------------------------------------------

describe('parseClozeTokens', () => {
  it('returns an empty array for plain text', () => {
    expect(parseClozeTokens('Hello world')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseClozeTokens('')).toEqual([]);
  });

  it('parses a single deletion', () => {
    const tokens = parseClozeTokens(
      'The {{c1::mitochondria}} is the powerhouse.',
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      raw: '{{c1::mitochondria}}',
      index: 1,
      answer: 'mitochondria',
      hint: null,
    });
  });

  it('parses a deletion with a hint', () => {
    const tokens = parseClozeTokens('{{c1::Paris::capital of France}}');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      index: 1,
      answer: 'Paris',
      hint: 'capital of France',
    });
  });

  it('parses multiple deletions', () => {
    const tokens = parseClozeTokens('{{c1::A}} and {{c2::B}} and {{c1::C}}');
    expect(tokens).toHaveLength(3);
    expect(tokens.map((t) => t.index)).toEqual([1, 2, 1]);
  });

  it('does not match invalid syntax', () => {
    expect(parseClozeTokens('{{notcloze}}')).toEqual([]);
    expect(parseClozeTokens('{c1::answer}')).toEqual([]);
    expect(parseClozeTokens('{{c1}}')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseCloze (segments)
// ---------------------------------------------------------------------------

describe('parseCloze', () => {
  it('returns a single text segment for plain text', () => {
    const segs = parseCloze('hello');
    expect(segs).toEqual([{ type: 'text', content: 'hello' }]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseCloze('')).toEqual([]);
  });

  it('splits text and cloze segments correctly', () => {
    const segs = parseCloze('The capital of France is {{c1::Paris}}.');
    expect(segs).toEqual([
      { type: 'text', content: 'The capital of France is ' },
      { type: 'cloze', index: 1, answer: 'Paris', hint: undefined },
      { type: 'text', content: '.' },
    ]);
  });

  it('handles leading cloze deletion (no preceding text)', () => {
    const segs = parseCloze('{{c1::Answer}} is correct.');
    expect(segs[0]).toMatchObject({ type: 'cloze', index: 1 });
    expect(segs[1]).toMatchObject({ type: 'text', content: ' is correct.' });
  });

  it('handles trailing cloze deletion (no trailing text)', () => {
    const segs = parseCloze('The answer is {{c1::42}}');
    expect(segs[segs.length - 1]).toMatchObject({ type: 'cloze', index: 1 });
  });

  it('handles multiple cloze deletions', () => {
    const segs = parseCloze('{{c1::A}} and {{c2::B}}');
    const clozeSegs = segs.filter((s) => s.type === 'cloze');
    expect(clozeSegs).toHaveLength(2);
  });

  it('includes hint in cloze segment', () => {
    const segs = parseCloze('{{c1::Paris::capital}}');
    const cloze = segs.find((s) => s.type === 'cloze');
    expect(cloze).toMatchObject({
      type: 'cloze',
      answer: 'Paris',
      hint: 'capital',
    });
  });
});

// ---------------------------------------------------------------------------
// getClozeIndices
// ---------------------------------------------------------------------------

describe('getClozeIndices', () => {
  it('returns empty array for plain text', () => {
    expect(getClozeIndices('no cloze here')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(getClozeIndices('')).toEqual([]);
  });

  it('returns unique indices in ascending order', () => {
    expect(getClozeIndices('{{c2::B}} {{c1::A}} {{c2::C}}')).toEqual([1, 2]);
  });

  it('returns a single index for a single deletion', () => {
    expect(getClozeIndices('{{c1::answer}}')).toEqual([1]);
  });

  it('handles non-contiguous indices', () => {
    expect(getClozeIndices('{{c3::C}} {{c1::A}}')).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// isValidCloze
// ---------------------------------------------------------------------------

describe('isValidCloze', () => {
  it('returns false for an empty string', () => {
    expect(isValidCloze('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isValidCloze('   ')).toBe(false);
  });

  it('returns false for plain text with no deletions', () => {
    expect(isValidCloze('Hello world')).toBe(false);
  });

  it('returns true for a valid single deletion', () => {
    expect(isValidCloze('{{c1::answer}}')).toBe(true);
  });

  it('returns true for valid multiple deletions', () => {
    expect(isValidCloze('{{c1::A}} and {{c2::B}}')).toBe(true);
  });

  it('returns false for deletion with empty answer', () => {
    // {{c1::}} — answer is empty
    expect(isValidCloze('{{c1::}}')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// renderClozeFront
// ---------------------------------------------------------------------------

describe('renderClozeFront', () => {
  it('hides the target deletion with [___]', () => {
    expect(renderClozeFront('{{c1::answer}}', 1)).toBe('[___]');
  });

  it('shows the hint when present and target is hidden', () => {
    expect(renderClozeFront('{{c1::answer::the hint}}', 1)).toBe('[the hint]');
  });

  it('reveals non-target deletions as plain text', () => {
    expect(renderClozeFront('{{c1::A}} and {{c2::B}}', 1)).toBe('[___] and B');
  });

  it('reveals all when active index does not match any deletion', () => {
    expect(renderClozeFront('{{c1::A}}', 99)).toBe('A');
  });

  it('handles multiple same-index deletions', () => {
    // Both c1 tokens should be hidden
    expect(renderClozeFront('{{c1::A}} and {{c1::C}}', 1)).toBe(
      '[___] and [___]',
    );
  });
});

// ---------------------------------------------------------------------------
// renderClozeBack
// ---------------------------------------------------------------------------

describe('renderClozeBack', () => {
  it('wraps the target answer in bold markdown', () => {
    expect(renderClozeBack('{{c1::answer}}', 1)).toBe('**answer**');
  });

  it('reveals non-target deletions as plain text', () => {
    expect(renderClozeBack('{{c1::A}} and {{c2::B}}', 1)).toBe('**A** and B');
  });

  it('preserves surrounding text', () => {
    expect(renderClozeBack('The {{c1::mitochondria}} is important.', 1)).toBe(
      'The **mitochondria** is important.',
    );
  });
});

// ---------------------------------------------------------------------------
// validateCloze
// ---------------------------------------------------------------------------

describe('validateCloze', () => {
  it('returns null for a valid cloze string', () => {
    expect(validateCloze('{{c1::answer}}')).toBeNull();
  });

  it('returns an error message for an empty string', () => {
    expect(validateCloze('')).not.toBeNull();
  });

  it('returns an error message when no deletions are found', () => {
    expect(validateCloze('plain text')).not.toBeNull();
  });

  it('detects mismatched braces', () => {
    const result = validateCloze('{{c1::answer}');
    expect(result).not.toBeNull();
    expect(result).toContain('braces');
  });
});

// ---------------------------------------------------------------------------
// renderClozeRevealed (backward compat)
// ---------------------------------------------------------------------------

describe('renderClozeRevealed', () => {
  it('reveals all deletions', () => {
    expect(renderClozeRevealed('{{c1::A}} and {{c2::B}}')).toBe('A and B');
  });

  it('returns plain text unchanged', () => {
    expect(renderClozeRevealed('no cloze here')).toBe('no cloze here');
  });
});
